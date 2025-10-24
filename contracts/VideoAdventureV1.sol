// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title VideoAdventure V1
 * @author 2009 Team
 * @notice Upgradeable NFT-based interactive movie platform with escrow and multi-movie support
 *
 * Architecture:
 * - Each scene is an ERC-721 NFT
 * - Multiple movies supported (isolated narrative trees)
 * - 1-hour escrow period with user confirmation or auto-release
 * - Revenue distribution: 35% scene creators, 55% movie creator, 10% platform
 * - Upgradeable via UUPS pattern
 *
 * Movie Creation:
 * - Platform movies: createPlatformMovie() - no deposit, immediately active (e.g., "2009")
 * - User movies: createMovie() - requires 2 ETH deposit, starts in Draft, requires approval
 * - Approved user movies: Platform keeps 2 ETH deposit, movie becomes active
 * - Rejected user movies: Creator can claim full refund
 *
 * Escrow Flow:
 * 1. User claims slot → Auto-expires old escrow if needed, payment goes to escrow, slot locked (no NFT yet)
 * 2. User confirms scene → NFT minted, funds distributed immediately
 * 3. User requests refund (anytime) → 50% returned, 50% to movie creator, slot reopens
 * 4. After 1 hour without success → Next claimSlot auto-expires and takes over (or checkExpiredEscrow for manual cleanup)
 *
 * Note: checkExpiredEscrow() is now optional - claimSlot() handles expiration automatically
 */
contract VideoAdventureV1 is
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============ STRUCTS ============

    enum MovieStatus {
        Draft,      // Pending platform review
        Active,     // Approved and live
        Paused,     // Temporarily disabled
        Rejected,   // Rejected by platform (deposit refundable)
        Archived    // No longer accepting scenes
    }

    struct Movie {
        uint256 id;
        string slug;                // URL identifier (e.g., "2009")
        string title;               // Display name
        address creator;            // Movie creator (earns 55% of all scenes)
        uint256 genesisSceneId;     // Root scene for this movie
        uint256 scenePrice;         // Price per scene (e.g., 0.007 ETH)
        MovieStatus status;         // Current state
        uint256 totalScenes;        // Stats
        uint256 depositAmount;      // Creator's deposit (2 ETH)
        bool depositRefunded;       // Has deposit been refunded?
    }

    struct Scene {
        uint256 id;                 // NFT token ID
        uint256 movieId;            // Which movie this belongs to
        uint256 parentId;           // Parent scene (0 for genesis)
        uint8 slot;                 // A=0, B=1, C=2 (genesis has slot 255)
        address creator;            // Scene owner (NFT holder)
        bool exists;                // Has been minted
        uint256 createdAt;          // Timestamp
    }

    struct Escrow {
        uint256 sceneId;            // Scene being purchased
        address buyer;              // Who paid
        uint256 amount;             // How much was paid
        uint256 createdAt;          // When escrow started
        uint256 expiresAt;          // When it can be released (createdAt + 1 hour)
        EscrowStatus status;        // Current state
    }

    enum EscrowStatus {
        Active,         // Escrow ongoing, waiting for confirmation/refund/expiry
        Confirmed,      // User confirmed, funds distributed, NFT minted
        Refunded,       // User refunded, slot reopened
        Expired         // Window expired without success, slot reopened, refund available
    }

    // ============ STATE VARIABLES ============

    // Movies
    mapping(uint256 => Movie) public movies;
    mapping(string => uint256) public movieIdBySlug; // slug => movie ID for lookups
    uint256 public nextMovieId;

    // Scenes (NFTs)
    mapping(uint256 => Scene) public scenes;
    uint256 public nextSceneId;

    // Slot occupation: movieId => parentId => slot => sceneId
    mapping(uint256 => mapping(uint256 => mapping(uint8 => uint256))) public slotTaken;

    // Escrows
    mapping(uint256 => Escrow) public escrows;

    // Revenue tracking (accumulated earnings per address)
    mapping(address => uint256) public earnings;

    // Platform treasury
    address public treasury;

    // Configurable parameters (can be updated by owner)
    uint256 public escrowDuration;           // Duration of escrow period (default: 1 hour)
    uint256 public refundPercentage;         // Percentage refunded to user (default: 50%)
    uint256 public movieCreationDeposit;     // Required deposit to create a movie (default: 2 ETH)
    uint256 public defaultScenePrice;        // Default price for platform movies (default: 0.007 ETH)

    // Revenue split (basis points: 10000 = 100%)
    uint256 public parentShare;              // Revenue to parent scene creator (default: 20%)
    uint256 public grandparentShare;         // Revenue to grandparent creator (default: 10%)
    uint256 public greatGrandparentShare;    // Revenue to great-grandparent creator (default: 5%)
    uint256 public movieCreatorShare;        // Revenue to movie creator (default: 55%)
    uint256 public platformShare;            // Revenue to platform (default: 10%)

    // ============ EVENTS ============

    event MovieCreated(uint256 indexed movieId, string slug, address indexed creator, uint256 depositAmount);
    event MovieApproved(uint256 indexed movieId);
    event MovieRejected(uint256 indexed movieId);
    event MovieDepositRefunded(uint256 indexed movieId, address indexed creator, uint256 amount);
    event MovieStatusUpdated(uint256 indexed movieId, MovieStatus status);
    event SlotClaimed(uint256 indexed sceneId, uint256 indexed movieId, uint256 indexed parentId, uint8 slot, address buyer, uint256 amount);
    event SceneConfirmed(uint256 indexed sceneId, address indexed creator);
    event EscrowExpired(uint256 indexed sceneId, address indexed buyer);
    event RefundIssued(uint256 indexed sceneId, address indexed buyer, uint256 amount);
    event EarningsWithdrawn(address indexed recipient, uint256 amount);
    event TreasuryUpdated(address newTreasury);
    event MovieCreatorUpdated(uint256 indexed movieId, address indexed oldCreator, address indexed newCreator);
    event EscrowDurationUpdated(uint256 newDuration);
    event RefundPercentageUpdated(uint256 newPercentage);
    event MovieDepositUpdated(uint256 newDeposit);
    event DefaultScenePriceUpdated(uint256 newPrice);
    event RevenueSharesUpdated(uint256 parent, uint256 grandparent, uint256 greatGrandparent, uint256 movieCreator, uint256 platform);

    // ============ ERRORS ============

    error MovieNotFound();
    error MovieNotActive();
    error MovieAlreadyApproved();
    error MovieDepositAlreadyRefunded();
    error InsufficientDeposit();
    error SlotAlreadyTaken();
    error InvalidSlot();
    error InsufficientPayment();
    error ParentSceneNotFound();
    error EscrowNotFound();
    error EscrowNotActive();
    error EscrowNotExpired();
    error NotEscrowBuyer();
    error NoEarnings();
    error TransferFailed();
    error SceneNotFound();
    error MovieSlugTaken();
    error InvalidPercentage();
    error InvalidRevenueShares();

    // ============ INITIALIZER ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _treasury
    ) public initializer {
        __ERC721_init("Video Adventure Scenes", "SCENE");
        __ERC721URIStorage_init();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        treasury = _treasury;
        nextMovieId = 1;
        nextSceneId = 1;

        // Set default parameters
        escrowDuration = 1 hours;
        refundPercentage = 50; // 50% refund
        movieCreationDeposit = 2 ether;
        defaultScenePrice = 0.007 ether;

        // Set default revenue shares (basis points: 10000 = 100%)
        parentShare = 2000;              // 20%
        grandparentShare = 1000;         // 10%
        greatGrandparentShare = 500;     // 5%
        movieCreatorShare = 5500;        // 55%
        platformShare = 1000;            // 10%
    }

    // ============ MOVIE MANAGEMENT ============

    /**
     * @notice Create a new movie with deposit (for approved partners only)
     * @param slug URL identifier (e.g., "cyberpunk-2077")
     * @param title Display name
     * @param creator Address that will receive movie creator revenue (55%)
     * @param scenePrice Price per scene in wei
     * @return movieId The ID of the created movie
     * @dev Only callable by platform owner. Partner provides 2 ETH deposit (sent with tx).
     *      Movie starts in Draft state and must be approved via approveMovie().
     *      If rejected, partner can claim full refund via claimMovieDepositRefund().
     *      For case-by-case partnerships handled by platform.
     */
    function createMovie(
        string calldata slug,
        string calldata title,
        address creator,
        uint256 scenePrice
    ) external payable onlyOwner returns (uint256) {
        if (msg.value < movieCreationDeposit) revert InsufficientDeposit();
        if (movieIdBySlug[slug] != 0) revert MovieSlugTaken();

        uint256 movieId = nextMovieId++;

        movies[movieId] = Movie({
            id: movieId,
            slug: slug,
            title: title,
            creator: creator,
            genesisSceneId: 0, // Will be set after genesis scene is minted
            scenePrice: scenePrice,
            status: MovieStatus.Draft, // Pending platform approval
            totalScenes: 0,
            depositAmount: msg.value,
            depositRefunded: false
        });

        movieIdBySlug[slug] = movieId;

        emit MovieCreated(movieId, slug, creator, msg.value);
        return movieId;
    }

    /**
     * @notice Create a platform-owned movie (no deposit required)
     * @param slug URL identifier (e.g., "2009")
     * @param title Display name
     * @param creator Address that will receive movie creator revenue (55%)
     * @param scenePrice Price per scene in wei
     * @return movieId The ID of the created movie
     * @dev Only callable by platform. Movie is immediately Active (no approval needed).
     */
    function createPlatformMovie(
        string calldata slug,
        string calldata title,
        address creator,
        uint256 scenePrice
    ) external onlyOwner returns (uint256) {
        if (movieIdBySlug[slug] != 0) revert MovieSlugTaken();

        uint256 movieId = nextMovieId++;

        movies[movieId] = Movie({
            id: movieId,
            slug: slug,
            title: title,
            creator: creator,
            genesisSceneId: 0, // Will be set after genesis scene is minted
            scenePrice: scenePrice,
            status: MovieStatus.Active, // Platform movies start active
            totalScenes: 0,
            depositAmount: 0, // No deposit for platform movies
            depositRefunded: false
        });

        movieIdBySlug[slug] = movieId;

        emit MovieCreated(movieId, slug, creator, 0);
        return movieId;
    }

    /**
     * @notice Create genesis scene for a movie (platform mints directly, no escrow)
     * @param movieId The movie to create genesis for
     * @param metadataURI Metadata URI for the genesis scene
     * @return sceneId The ID of the genesis scene
     */
    function createGenesisScene(
        uint256 movieId,
        string calldata metadataURI
    ) external onlyOwner returns (uint256) {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();
        if (movie.genesisSceneId != 0) revert("Genesis already exists");

        uint256 sceneId = nextSceneId++;

        scenes[sceneId] = Scene({
            id: sceneId,
            movieId: movieId,
            parentId: 0,
            slot: 255, // Special value for genesis (not A/B/C)
            creator: movie.creator,
            exists: true,
            createdAt: block.timestamp
        });

        movie.genesisSceneId = sceneId;
        movie.totalScenes = 1;

        _safeMint(movie.creator, sceneId);
        _setTokenURI(sceneId, metadataURI);

        return sceneId;
    }

    /**
     * @notice Approve a movie (activates it for users)
     * @dev Deposit is retained by platform as onboarding fee
     */
    function approveMovie(uint256 movieId) external onlyOwner {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();
        if (movie.status == MovieStatus.Active) revert MovieAlreadyApproved();

        movie.status = MovieStatus.Active;

        // Deposit goes to platform treasury (onboarding fee)
        earnings[treasury] += movie.depositAmount;

        emit MovieApproved(movieId);
        emit MovieStatusUpdated(movieId, MovieStatus.Active);
    }

    /**
     * @notice Reject a movie (allows creator to claim deposit refund)
     */
    function rejectMovie(uint256 movieId) external onlyOwner {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();

        movie.status = MovieStatus.Rejected;

        emit MovieRejected(movieId);
        emit MovieStatusUpdated(movieId, MovieStatus.Rejected);
    }

    /**
     * @notice Refund deposit to rejected movie creator
     */
    function claimMovieDepositRefund(uint256 movieId) external nonReentrant {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();
        if (movie.status != MovieStatus.Rejected) revert("Movie not rejected");
        if (movie.creator != msg.sender) revert("Not movie creator");
        if (movie.depositRefunded) revert MovieDepositAlreadyRefunded();

        movie.depositRefunded = true;

        (bool success, ) = msg.sender.call{value: movie.depositAmount}("");
        if (!success) revert TransferFailed();

        emit MovieDepositRefunded(movieId, msg.sender, movie.depositAmount);
    }

    /**
     * @notice Update movie status (pause, archive, etc.)
     */
    function setMovieStatus(uint256 movieId, MovieStatus newStatus) external onlyOwner {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();

        movie.status = newStatus;
        emit MovieStatusUpdated(movieId, newStatus);
    }

    /**
     * @notice Update movie scene price
     */
    function setMoviePrice(uint256 movieId, uint256 newPrice) external onlyOwner {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();

        movie.scenePrice = newPrice;
    }

    /**
     * @notice Update movie creator (revenue recipient)
     * @param movieId The movie to update
     * @param newCreator New address to receive movie creator revenue (55%)
     * @dev Useful for transferring partnerships, fixing mistakes, or handling disputes
     */
    function setMovieCreator(uint256 movieId, address newCreator) external onlyOwner {
        Movie storage movie = movies[movieId];
        if (movie.id == 0) revert MovieNotFound();
        if (newCreator == address(0)) revert("Invalid creator address");

        address oldCreator = movie.creator;
        movie.creator = newCreator;

        emit MovieCreatorUpdated(movieId, oldCreator, newCreator);
    }

    // ============ PLATFORM CONFIGURATION ============

    /**
     * @notice Update escrow duration
     * @param newDuration New duration in seconds
     */
    function setEscrowDuration(uint256 newDuration) external onlyOwner {
        escrowDuration = newDuration;
        emit EscrowDurationUpdated(newDuration);
    }

    /**
     * @notice Update refund percentage
     * @param newPercentage New refund percentage (0-100)
     */
    function setRefundPercentage(uint256 newPercentage) external onlyOwner {
        if (newPercentage > 100) revert InvalidPercentage();
        refundPercentage = newPercentage;
        emit RefundPercentageUpdated(newPercentage);
    }

    /**
     * @notice Update movie creation deposit
     * @param newDeposit New deposit amount in wei
     */
    function setMovieCreationDeposit(uint256 newDeposit) external onlyOwner {
        movieCreationDeposit = newDeposit;
        emit MovieDepositUpdated(newDeposit);
    }

    /**
     * @notice Update default scene price
     * @param newPrice New default price in wei
     */
    function setDefaultScenePrice(uint256 newPrice) external onlyOwner {
        defaultScenePrice = newPrice;
        emit DefaultScenePriceUpdated(newPrice);
    }

    /**
     * @notice Update revenue shares
     * @param _parent Parent scene creator share (basis points)
     * @param _grandparent Grandparent creator share (basis points)
     * @param _greatGrandparent Great-grandparent creator share (basis points)
     * @param _movieCreator Movie creator share (basis points)
     * @param _platform Platform share (basis points)
     * @dev All shares must sum to 10000 (100%)
     */
    function setRevenueShares(
        uint256 _parent,
        uint256 _grandparent,
        uint256 _greatGrandparent,
        uint256 _movieCreator,
        uint256 _platform
    ) external onlyOwner {
        uint256 total = _parent + _grandparent + _greatGrandparent + _movieCreator + _platform;
        if (total != 10000) revert InvalidRevenueShares();

        parentShare = _parent;
        grandparentShare = _grandparent;
        greatGrandparentShare = _greatGrandparent;
        movieCreatorShare = _movieCreator;
        platformShare = _platform;

        emit RevenueSharesUpdated(_parent, _grandparent, _greatGrandparent, _movieCreator, _platform);
    }

    // ============ SCENE CLAIMING (USER FLOW) ============

    /**
     * @notice Claim a slot on a parent scene (starts escrow, locks slot)
     * @param parentId Parent scene ID
     * @param slot Slot to claim (0=A, 1=B, 2=C)
     * @return sceneId The ID reserved for this scene (not minted yet)
     * @dev Automatically handles expired escrows - if slot occupied but escrow expired, takes over
     */
    function claimSlot(uint256 parentId, uint8 slot) external payable nonReentrant returns (uint256) {
        if (slot > 2) revert InvalidSlot();

        // Get parent scene
        Scene storage parent = scenes[parentId];
        if (!parent.exists) revert ParentSceneNotFound();

        // Get movie
        Movie storage movie = movies[parent.movieId];
        if (movie.status != MovieStatus.Active) revert MovieNotActive();

        // Check if slot is occupied
        uint256 existingSceneId = slotTaken[parent.movieId][parentId][slot];

        // If slot is taken, check if escrow expired (auto-cleanup)
        if (existingSceneId != 0) {
            Escrow storage existingEscrow = escrows[existingSceneId];

            // Only allow takeover if escrow is Active and expired
            if (existingEscrow.status == EscrowStatus.Active &&
                block.timestamp >= existingEscrow.expiresAt) {

                // Auto-expire the escrow
                existingEscrow.status = EscrowStatus.Expired;
                slotTaken[parent.movieId][parentId][slot] = 0;

                emit EscrowExpired(existingSceneId, existingEscrow.buyer);

                // Slot is now available, continue with claim below
            } else {
                // Slot legitimately taken (confirmed, refunded, or active but not expired)
                revert SlotAlreadyTaken();
            }
        }

        // Check payment
        if (msg.value < movie.scenePrice) revert InsufficientPayment();

        // Reserve scene ID
        uint256 sceneId = nextSceneId++;

        // Create scene record (not minted yet)
        scenes[sceneId] = Scene({
            id: sceneId,
            movieId: parent.movieId,
            parentId: parentId,
            slot: slot,
            creator: address(0), // Will be set when confirmed/released
            exists: false, // Not minted yet
            createdAt: 0 // Will be set when confirmed/released
        });

        // Lock slot
        slotTaken[parent.movieId][parentId][slot] = sceneId;

        // Create escrow
        escrows[sceneId] = Escrow({
            sceneId: sceneId,
            buyer: msg.sender,
            amount: msg.value,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + escrowDuration,
            status: EscrowStatus.Active
        });

        emit SlotClaimed(sceneId, parent.movieId, parentId, slot, msg.sender, msg.value);

        return sceneId;
    }

    /**
     * @notice User confirms scene (happy with video) - instant NFT mint + distribution
     * @param sceneId The scene to confirm
     * @param metadataURI Metadata URI for the scene
     */
    function confirmScene(uint256 sceneId, string calldata metadataURI) external nonReentrant {
        Escrow storage escrow = escrows[sceneId];
        if (escrow.sceneId == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Active) revert EscrowNotActive();
        if (escrow.buyer != msg.sender) revert NotEscrowBuyer();

        // Update escrow
        escrow.status = EscrowStatus.Confirmed;

        // Update scene
        Scene storage scene = scenes[sceneId];
        scene.creator = msg.sender;
        scene.exists = true;
        scene.createdAt = block.timestamp;

        // Update movie stats
        movies[scene.movieId].totalScenes++;

        // Mint NFT
        _safeMint(msg.sender, sceneId);
        _setTokenURI(sceneId, metadataURI);

        // Distribute payment
        _distributePayment(sceneId, escrow.amount);

        emit SceneConfirmed(sceneId, msg.sender);
    }

    /**
     * @notice Check and mark escrow as expired (permissionless - anyone can call)
     * @param sceneId The scene to check
     * @dev OPTIONAL cleanup utility - claimSlot() now handles expiration automatically
     * @dev Useful for freeing up slots without making a new claim
     */
    function checkExpiredEscrow(uint256 sceneId) external nonReentrant {
        Escrow storage escrow = escrows[sceneId];
        if (escrow.sceneId == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Active) revert EscrowNotActive();
        if (block.timestamp < escrow.expiresAt) revert EscrowNotExpired();

        // Update escrow status
        escrow.status = EscrowStatus.Expired;

        // Reopen slot - allows another user to try
        Scene storage scene = scenes[sceneId];
        slotTaken[scene.movieId][scene.parentId][scene.slot] = 0;

        emit EscrowExpired(sceneId, escrow.buyer);
    }

    /**
     * @notice Request refund (video generation failed or user unhappy)
     * @param sceneId The scene to refund
     * @dev Can be called during Active escrow OR after Expired
     */
    function requestRefund(uint256 sceneId) external nonReentrant {
        Escrow storage escrow = escrows[sceneId];
        if (escrow.sceneId == 0) revert EscrowNotFound();
        if (escrow.buyer != msg.sender) revert NotEscrowBuyer();

        // Allow refund if Active (user gives up early) OR Expired (window passed)
        if (escrow.status != EscrowStatus.Active && escrow.status != EscrowStatus.Expired) {
            revert EscrowNotActive();
        }

        // Update escrow
        escrow.status = EscrowStatus.Refunded;

        // Reopen slot (if not already reopened by checkExpiredEscrow)
        Scene storage scene = scenes[sceneId];
        if (slotTaken[scene.movieId][scene.parentId][scene.slot] == sceneId) {
            slotTaken[scene.movieId][scene.parentId][scene.slot] = 0;
        }

        // Calculate refund (50% to user, 50% to movie creator for platform costs)
        uint256 refundAmount = (escrow.amount * refundPercentage) / 100;
        uint256 movieCreatorAmount = escrow.amount - refundAmount;

        // Send refund to user
        (bool refundSuccess, ) = msg.sender.call{value: refundAmount}("");
        if (!refundSuccess) revert TransferFailed();

        // Credit movie creator
        Movie storage movie = movies[scene.movieId];
        earnings[movie.creator] += movieCreatorAmount;

        emit RefundIssued(sceneId, msg.sender, refundAmount);
    }


    // ============ REVENUE DISTRIBUTION ============

    /**
     * @notice Distribute payment according to revenue split
     * @param sceneId The scene being paid for
     * @param amount Total amount to distribute
     */
    function _distributePayment(uint256 sceneId, uint256 amount) private {
        Scene storage scene = scenes[sceneId];
        Movie storage movie = movies[scene.movieId];

        uint256 remaining = amount;

        // Parent creator (20%)
        uint256 parentAmount = (amount * parentShare) / 10000;
        Scene storage parent = scenes[scene.parentId];
        if (parent.exists && parent.creator != address(0)) {
            earnings[parent.creator] += parentAmount;
            remaining -= parentAmount;
        }

        // Grandparent creator (10%)
        if (parent.exists && parent.parentId != 0) {
            uint256 grandparentAmount = (amount * grandparentShare) / 10000;
            Scene storage grandparent = scenes[parent.parentId];
            if (grandparent.exists && grandparent.creator != address(0)) {
                earnings[grandparent.creator] += grandparentAmount;
                remaining -= grandparentAmount;
            }

            // Great-grandparent creator (5%)
            if (grandparent.exists && grandparent.parentId != 0) {
                uint256 greatGrandparentAmount = (amount * greatGrandparentShare) / 10000;
                Scene storage greatGrandparent = scenes[grandparent.parentId];
                if (greatGrandparent.exists && greatGrandparent.creator != address(0)) {
                    earnings[greatGrandparent.creator] += greatGrandparentAmount;
                    remaining -= greatGrandparentAmount;
                }
            }
        }

        // Movie creator (55% or remaining if ancestors don't exist)
        uint256 movieCreatorAmount = (amount * movieCreatorShare) / 10000;
        // If ancestors didn't exist, add their unclaimed shares to movie creator
        if (remaining > movieCreatorAmount) {
            earnings[movie.creator] += remaining - ((amount * platformShare) / 10000);
        } else {
            earnings[movie.creator] += movieCreatorAmount;
        }

        // Platform treasury (10%)
        uint256 platformAmount = (amount * platformShare) / 10000;
        earnings[treasury] += platformAmount;
    }

    /**
     * @notice Withdraw accumulated earnings
     */
    function withdrawEarnings() external nonReentrant {
        uint256 amount = earnings[msg.sender];
        if (amount == 0) revert NoEarnings();

        earnings[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EarningsWithdrawn(msg.sender, amount);
    }

    // ============ VIEW FUNCTIONS ============

    function getMovie(uint256 movieId) external view returns (Movie memory) {
        return movies[movieId];
    }

    function getMovieBySlug(string calldata slug) external view returns (Movie memory) {
        uint256 movieId = movieIdBySlug[slug];
        if (movieId == 0) revert MovieNotFound();
        return movies[movieId];
    }

    function getScene(uint256 sceneId) external view returns (Scene memory) {
        return scenes[sceneId];
    }

    function getEscrow(uint256 sceneId) external view returns (Escrow memory) {
        return escrows[sceneId];
    }

    function isSlotAvailable(uint256 movieId, uint256 parentId, uint8 slot) external view returns (bool) {
        return slotTaken[movieId][parentId][slot] == 0;
    }

    function getChildScenes(uint256 movieId, uint256 parentId) external view returns (uint256[3] memory) {
        return [
            slotTaken[movieId][parentId][0],
            slotTaken[movieId][parentId][1],
            slotTaken[movieId][parentId][2]
        ];
    }

    // ============ ADMIN FUNCTIONS ============

    function setTreasury(address _newTreasury) external onlyOwner {
        treasury = _newTreasury;
        emit TreasuryUpdated(_newTreasury);
    }

    // ============ UPGRADABILITY ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ ERC721 OVERRIDES ============

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ============ STORAGE GAP ============

    /**
     * @dev Storage gap for future upgrades
     * Reduces risk of storage collisions in future versions
     */
    uint256[50] private __gap;
}
