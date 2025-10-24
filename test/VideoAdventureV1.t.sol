// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "../contracts/VideoAdventureV1.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract VideoAdventureV1Test is Test {
    VideoAdventureV1 public implementation;
    VideoAdventureV1 public adventure;

    address public owner = address(this);
    address public treasury = address(0x1);
    address public movieCreator = address(0x2);
    address public user1 = address(0x3);
    address public user2 = address(0x4);
    address public user3 = address(0x5);

    uint256 constant SCENE_PRICE = 0.007 ether;
    uint256 constant MOVIE_DEPOSIT = 2 ether;

    event MovieCreated(uint256 indexed movieId, string slug, address indexed creator, uint256 depositAmount);
    event MovieApproved(uint256 indexed movieId);
    event MovieRejected(uint256 indexed movieId);
    event SlotClaimed(uint256 indexed sceneId, uint256 indexed movieId, uint256 indexed parentId, uint8 slot, address buyer, uint256 amount);
    event SceneConfirmed(uint256 indexed sceneId, address indexed creator);
    event EscrowExpired(uint256 indexed sceneId, address indexed buyer);
    event RefundIssued(uint256 indexed sceneId, address indexed buyer, uint256 amount);

    function setUp() public {
        // Deploy implementation
        implementation = new VideoAdventureV1();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            VideoAdventureV1.initialize.selector,
            treasury
        );

        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );

        adventure = VideoAdventureV1(address(proxy));

        // Fund test accounts
        vm.deal(movieCreator, 10 ether);
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        vm.deal(user3, 10 ether);
    }

    // ============ PLATFORM MOVIE TESTS ============

    function testCreatePlatformMovie() public {
        vm.expectEmit(true, true, false, true);
        emit MovieCreated(1, "2009", movieCreator, 0);

        uint256 movieId = adventure.createPlatformMovie(
            "2009",
            "The First Decision",
            movieCreator,
            SCENE_PRICE
        );

        assertEq(movieId, 1);

        VideoAdventureV1.Movie memory movie = adventure.getMovie(movieId);
        assertEq(movie.id, 1);
        assertEq(movie.slug, "2009");
        assertEq(movie.title, "The First Decision");
        assertEq(movie.creator, movieCreator);
        assertEq(movie.scenePrice, SCENE_PRICE);
        assertTrue(movie.status == VideoAdventureV1.MovieStatus.Active);
        assertEq(movie.depositAmount, 0);
        assertFalse(movie.depositRefunded);
    }

    function testCannotCreatePlatformMovieAsNonOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        adventure.createPlatformMovie(
            "2009",
            "The First Decision",
            movieCreator,
            SCENE_PRICE
        );
    }

    function testCannotCreateDuplicateSlug() public {
        adventure.createPlatformMovie(
            "2009",
            "The First Decision",
            movieCreator,
            SCENE_PRICE
        );

        vm.expectRevert(VideoAdventureV1.MovieSlugTaken.selector);
        adventure.createPlatformMovie(
            "2009",
            "Another Movie",
            movieCreator,
            SCENE_PRICE
        );
    }

    // ============ USER MOVIE TESTS ============

    function testCreateUserMovie() public {
        // Owner creates movie on behalf of user1
        vm.expectEmit(true, true, false, true);
        emit MovieCreated(1, "cyberpunk", user1, MOVIE_DEPOSIT);

        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );

        assertEq(movieId, 1);

        VideoAdventureV1.Movie memory movie = adventure.getMovie(movieId);
        assertEq(movie.creator, user1);
        assertTrue(movie.status == VideoAdventureV1.MovieStatus.Draft);
        assertEq(movie.depositAmount, MOVIE_DEPOSIT);
        assertFalse(movie.depositRefunded);
    }

    function testCannotCreateUserMovieWithInsufficientDeposit() public {
        // Owner tries to create with insufficient deposit
        vm.expectRevert(VideoAdventureV1.InsufficientDeposit.selector);
        adventure.createMovie{value: 1 ether}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );
    }

    function testApproveUserMovie() public {
        // Owner creates user movie
        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );

        // Platform approves
        uint256 treasuryBalanceBefore = adventure.earnings(treasury);

        vm.expectEmit(true, false, false, false);
        emit MovieApproved(movieId);

        adventure.approveMovie(movieId);

        VideoAdventureV1.Movie memory movie = adventure.getMovie(movieId);
        assertTrue(movie.status == VideoAdventureV1.MovieStatus.Active);

        // Treasury should receive deposit
        assertEq(adventure.earnings(treasury), treasuryBalanceBefore + MOVIE_DEPOSIT);
    }

    function testRejectUserMovie() public {
        // Owner creates user movie
        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );

        // Platform rejects
        vm.expectEmit(true, false, false, false);
        emit MovieRejected(movieId);

        adventure.rejectMovie(movieId);

        VideoAdventureV1.Movie memory movie = adventure.getMovie(movieId);
        assertTrue(movie.status == VideoAdventureV1.MovieStatus.Rejected);
    }

    function testClaimDepositRefund() public {
        // Owner creates user movie
        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );

        // Platform rejects
        adventure.rejectMovie(movieId);

        // User claims refund
        uint256 balanceBefore = user1.balance;

        vm.prank(user1);
        adventure.claimMovieDepositRefund(movieId);

        assertEq(user1.balance, balanceBefore + MOVIE_DEPOSIT);

        VideoAdventureV1.Movie memory movie = adventure.getMovie(movieId);
        assertTrue(movie.depositRefunded);
    }

    function testCannotClaimRefundIfNotRejected() public {
        // Owner creates and approves user movie
        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );

        adventure.approveMovie(movieId);

        // Try to claim refund (should fail)
        vm.prank(user1);
        vm.expectRevert("Movie not rejected");
        adventure.claimMovieDepositRefund(movieId);
    }

    function testCannotClaimRefundTwice() public {
        // Owner creates and rejects user movie
        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}(
            "cyberpunk",
            "Neon Dreams",
            user1,  // creator address
            SCENE_PRICE
        );

        adventure.rejectMovie(movieId);

        // Claim refund once
        vm.prank(user1);
        adventure.claimMovieDepositRefund(movieId);

        // Try to claim again (should fail)
        vm.prank(user1);
        vm.expectRevert(VideoAdventureV1.MovieDepositAlreadyRefunded.selector);
        adventure.claimMovieDepositRefund(movieId);
    }

    // ============ GENESIS SCENE TESTS ============

    function testCreateGenesisScene() public {
        // Create platform movie first
        uint256 movieId = adventure.createPlatformMovie(
            "2009",
            "The First Decision",
            movieCreator,
            SCENE_PRICE
        );

        // Create genesis scene
        uint256 sceneId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        assertEq(sceneId, 1);

        VideoAdventureV1.Scene memory scene = adventure.getScene(sceneId);
        assertEq(scene.id, 1);
        assertEq(scene.movieId, movieId);
        assertEq(scene.parentId, 0);
        assertEq(scene.slot, 255); // Genesis slot
        assertEq(scene.creator, movieCreator);
        assertTrue(scene.exists);

        // Check NFT was minted
        assertEq(adventure.ownerOf(sceneId), movieCreator);
        assertEq(adventure.tokenURI(sceneId), "ipfs://genesis");
    }

    // ============ SLOT CLAIMING TESTS ============

    function testClaimSlot() public {
        // Setup: Create movie with genesis scene
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User claims slot A
        vm.expectEmit(true, true, true, true);
        emit SlotClaimed(2, movieId, genesisId, 0, user1, SCENE_PRICE);

        vm.prank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        assertEq(sceneId, 2);

        // Check escrow
        VideoAdventureV1.Escrow memory escrow = adventure.getEscrow(sceneId);
        assertEq(escrow.sceneId, sceneId);
        assertEq(escrow.buyer, user1);
        assertEq(escrow.amount, SCENE_PRICE);
        assertTrue(escrow.status == VideoAdventureV1.EscrowStatus.Active);

        // Check slot is taken
        assertFalse(adventure.isSlotAvailable(movieId, genesisId, 0));
    }

    function testCannotClaimTakenSlot() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User1 claims slot A
        vm.prank(user1);
        adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        // User2 tries to claim same slot
        vm.prank(user2);
        vm.expectRevert(VideoAdventureV1.SlotAlreadyTaken.selector);
        adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);
    }

    function testCannotClaimInactiveMovie() public {
        // Owner creates draft user movie (not active)
        uint256 movieId = adventure.createMovie{value: MOVIE_DEPOSIT}("cyberpunk", "Neon Dreams", user1, SCENE_PRICE);

        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // Try to claim slot (should fail - movie not active)
        vm.prank(user2);
        vm.expectRevert(VideoAdventureV1.MovieNotActive.selector);
        adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);
    }

    function testAutoExpireAndTakeover() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User1 claims slot
        vm.prank(user1);
        uint256 sceneId1 = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        // Fast forward past 1 hour
        vm.warp(block.timestamp + 1 hours + 1);

        // User2 claims same slot (should auto-expire user1's escrow)
        vm.expectEmit(true, true, false, false);
        emit EscrowExpired(sceneId1, user1);

        vm.prank(user2);
        uint256 sceneId2 = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        assertEq(sceneId2, 3);

        // Check old escrow is expired
        VideoAdventureV1.Escrow memory oldEscrow = adventure.getEscrow(sceneId1);
        assertTrue(oldEscrow.status == VideoAdventureV1.EscrowStatus.Expired);

        // Check new escrow is active
        VideoAdventureV1.Escrow memory newEscrow = adventure.getEscrow(sceneId2);
        assertTrue(newEscrow.status == VideoAdventureV1.EscrowStatus.Active);
        assertEq(newEscrow.buyer, user2);
    }

    // ============ SCENE CONFIRMATION TESTS ============

    function testConfirmScene() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User claims slot
        vm.prank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        // User confirms scene
        vm.expectEmit(true, true, false, false);
        emit SceneConfirmed(sceneId, user1);

        vm.prank(user1);
        adventure.confirmScene(sceneId, "ipfs://scene1");

        // Check scene is confirmed
        VideoAdventureV1.Scene memory scene = adventure.getScene(sceneId);
        assertTrue(scene.exists);
        assertEq(scene.creator, user1);

        // Check NFT minted
        assertEq(adventure.ownerOf(sceneId), user1);

        // Check escrow confirmed
        VideoAdventureV1.Escrow memory escrow = adventure.getEscrow(sceneId);
        assertTrue(escrow.status == VideoAdventureV1.EscrowStatus.Confirmed);
    }

    function testOnlyBuyerCanConfirm() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User1 claims slot
        vm.prank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        // User2 tries to confirm (should fail)
        vm.prank(user2);
        vm.expectRevert(VideoAdventureV1.NotEscrowBuyer.selector);
        adventure.confirmScene(sceneId, "ipfs://scene1");
    }

    // ============ REFUND TESTS ============

    function testRequestRefund() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User claims slot
        vm.prank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        uint256 balanceBefore = user1.balance;
        uint256 movieCreatorEarningsBefore = adventure.earnings(movieCreator);

        // User requests refund
        uint256 expectedRefund = (SCENE_PRICE * 50) / 100;
        uint256 expectedMovieCreatorAmount = SCENE_PRICE - expectedRefund;

        vm.expectEmit(true, true, false, true);
        emit RefundIssued(sceneId, user1, expectedRefund);

        vm.prank(user1);
        adventure.requestRefund(sceneId);

        // Check user received 50%
        assertEq(user1.balance, balanceBefore + expectedRefund);

        // Check movie creator received 50%
        assertEq(adventure.earnings(movieCreator), movieCreatorEarningsBefore + expectedMovieCreatorAmount);

        // Check escrow refunded
        VideoAdventureV1.Escrow memory escrow = adventure.getEscrow(sceneId);
        assertTrue(escrow.status == VideoAdventureV1.EscrowStatus.Refunded);

        // Check slot reopened
        assertTrue(adventure.isSlotAvailable(movieId, genesisId, 0));
    }

    function testRefundAfterExpiry() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User claims slot
        vm.prank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        // Fast forward past 1 hour
        vm.warp(block.timestamp + 1 hours + 1);

        // Mark as expired first
        adventure.checkExpiredEscrow(sceneId);

        // User requests refund
        uint256 balanceBefore = user1.balance;
        uint256 expectedRefund = (SCENE_PRICE * 50) / 100;

        vm.prank(user1);
        adventure.requestRefund(sceneId);

        assertEq(user1.balance, balanceBefore + expectedRefund);
    }

    function testCannotRefundConfirmedScene() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User claims and confirms
        vm.startPrank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);
        adventure.confirmScene(sceneId, "ipfs://scene1");

        // Try to refund (should fail)
        vm.expectRevert(VideoAdventureV1.EscrowNotActive.selector);
        adventure.requestRefund(sceneId);
        vm.stopPrank();
    }

    // ============ REVENUE DISTRIBUTION TESTS ============

    function testRevenueDistributionThreeGenerations() public {
        // Setup movie
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User1 creates scene A (child of genesis)
        vm.prank(user1);
        uint256 sceneA = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);
        vm.prank(user1);
        adventure.confirmScene(sceneA, "ipfs://sceneA");

        // User2 creates scene B (grandchild of genesis)
        vm.prank(user2);
        uint256 sceneB = adventure.claimSlot{value: SCENE_PRICE}(sceneA, 0);
        vm.prank(user2);
        adventure.confirmScene(sceneB, "ipfs://sceneB");

        // User3 creates scene C (great-grandchild of genesis)
        vm.prank(user3);
        uint256 sceneC = adventure.claimSlot{value: SCENE_PRICE}(sceneB, 0);

        // Clear previous earnings
        uint256 user1EarningsBefore = adventure.earnings(user1);
        uint256 user2EarningsBefore = adventure.earnings(user2);
        uint256 movieCreatorEarningsBefore = adventure.earnings(movieCreator);
        uint256 treasuryEarningsBefore = adventure.earnings(treasury);

        vm.prank(user3);
        adventure.confirmScene(sceneC, "ipfs://sceneC");

        // Check revenue distribution
        // Parent (user2): 20% of 0.007 = 0.0014 ETH
        uint256 expectedParent = (SCENE_PRICE * 2000) / 10000;
        assertEq(adventure.earnings(user2) - user2EarningsBefore, expectedParent);

        // Grandparent (user1): 10% of 0.007 = 0.0007 ETH
        uint256 expectedGrandparent = (SCENE_PRICE * 1000) / 10000;
        assertEq(adventure.earnings(user1) - user1EarningsBefore, expectedGrandparent);

        // Great-grandparent (movieCreator via genesis): 5% of 0.007 = 0.00035 ETH
        uint256 expectedGreatGrandparent = (SCENE_PRICE * 500) / 10000;

        // Movie creator: 55% + great-grandparent share = 60% total
        uint256 expectedMovieCreator = (SCENE_PRICE * 5500) / 10000 + expectedGreatGrandparent;
        assertEq(adventure.earnings(movieCreator) - movieCreatorEarningsBefore, expectedMovieCreator);

        // Platform: 10% of 0.007 = 0.0007 ETH
        uint256 expectedPlatform = (SCENE_PRICE * 1000) / 10000;
        assertEq(adventure.earnings(treasury) - treasuryEarningsBefore, expectedPlatform);
    }

    function testWithdrawEarnings() public {
        // Setup
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // User1 creates scene
        vm.prank(user1);
        uint256 sceneA = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);
        vm.prank(user1);
        adventure.confirmScene(sceneA, "ipfs://sceneA");

        // User2 creates child scene (user1 earns 20%)
        vm.prank(user2);
        uint256 sceneB = adventure.claimSlot{value: SCENE_PRICE}(sceneA, 0);
        vm.prank(user2);
        adventure.confirmScene(sceneB, "ipfs://sceneB");

        // User1 withdraws earnings
        uint256 expectedEarnings = (SCENE_PRICE * 2000) / 10000;
        uint256 balanceBefore = user1.balance;

        vm.prank(user1);
        adventure.withdrawEarnings();

        assertEq(user1.balance, balanceBefore + expectedEarnings);
        assertEq(adventure.earnings(user1), 0);
    }

    function testCannotWithdrawZeroEarnings() public {
        vm.prank(user1);
        vm.expectRevert(VideoAdventureV1.NoEarnings.selector);
        adventure.withdrawEarnings();
    }

    // ============ HELPER VIEW FUNCTION TESTS ============

    function testGetChildScenes() public {
        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // Initially all slots empty
        uint256[3] memory children = adventure.getChildScenes(movieId, genesisId);
        assertEq(children[0], 0);
        assertEq(children[1], 0);
        assertEq(children[2], 0);

        // Claim slot A
        vm.prank(user1);
        uint256 sceneA = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        children = adventure.getChildScenes(movieId, genesisId);
        assertEq(children[0], sceneA);
        assertEq(children[1], 0);
        assertEq(children[2], 0);
    }

    function testGetMovieBySlug() public {
        adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);

        VideoAdventureV1.Movie memory movie = adventure.getMovieBySlug("2009");
        assertEq(movie.slug, "2009");
        assertEq(movie.creator, movieCreator);
    }

    function testGetMovieBySlugNotFound() public {
        vm.expectRevert(VideoAdventureV1.MovieNotFound.selector);
        adventure.getMovieBySlug("nonexistent");
    }

    // ============ PLATFORM CONFIGURATION TESTS ============

    function testSetEscrowDuration() public {
        // Check default value
        assertEq(adventure.escrowDuration(), 1 hours);

        // Update to 2 hours
        adventure.setEscrowDuration(2 hours);
        assertEq(adventure.escrowDuration(), 2 hours);
    }

    function testSetRefundPercentage() public {
        // Check default value
        assertEq(adventure.refundPercentage(), 50);

        // Update to 75%
        adventure.setRefundPercentage(75);
        assertEq(adventure.refundPercentage(), 75);
    }

    function testCannotSetRefundPercentageOver100() public {
        vm.expectRevert(VideoAdventureV1.InvalidPercentage.selector);
        adventure.setRefundPercentage(101);
    }

    function testSetMovieCreationDeposit() public {
        // Check default value
        assertEq(adventure.movieCreationDeposit(), 2 ether);

        // Update to 1 ether
        adventure.setMovieCreationDeposit(1 ether);
        assertEq(adventure.movieCreationDeposit(), 1 ether);
    }

    function testSetDefaultScenePrice() public {
        // Check default value
        assertEq(adventure.defaultScenePrice(), 0.007 ether);

        // Update to 0.01 ether
        adventure.setDefaultScenePrice(0.01 ether);
        assertEq(adventure.defaultScenePrice(), 0.01 ether);
    }

    function testSetRevenueShares() public {
        // Check default values
        assertEq(adventure.parentShare(), 2000);              // 20%
        assertEq(adventure.grandparentShare(), 1000);         // 10%
        assertEq(adventure.greatGrandparentShare(), 500);     // 5%
        assertEq(adventure.movieCreatorShare(), 5500);        // 55%
        assertEq(adventure.platformShare(), 1000);            // 10%

        // Update to new distribution: 15%, 10%, 5%, 60%, 10%
        adventure.setRevenueShares(1500, 1000, 500, 6000, 1000);

        assertEq(adventure.parentShare(), 1500);
        assertEq(adventure.grandparentShare(), 1000);
        assertEq(adventure.greatGrandparentShare(), 500);
        assertEq(adventure.movieCreatorShare(), 6000);
        assertEq(adventure.platformShare(), 1000);
    }

    function testCannotSetRevenueSharesNotSumming100Percent() public {
        // Try to set shares that don't sum to 10000 (100%)
        vm.expectRevert(VideoAdventureV1.InvalidRevenueShares.selector);
        adventure.setRevenueShares(2000, 1000, 500, 5500, 2000); // Sums to 11000 (110%)
    }

    function testOnlyOwnerCanSetConfiguration() public {
        vm.startPrank(user1);

        vm.expectRevert();
        adventure.setEscrowDuration(2 hours);

        vm.expectRevert();
        adventure.setRefundPercentage(75);

        vm.expectRevert();
        adventure.setMovieCreationDeposit(1 ether);

        vm.expectRevert();
        adventure.setDefaultScenePrice(0.01 ether);

        vm.expectRevert();
        adventure.setRevenueShares(1500, 1000, 500, 6000, 1000);

        vm.stopPrank();
    }

    function testUpdatedRefundPercentageAffectsNewRefunds() public {
        // Setup: create movie and scene
        uint256 movieId = adventure.createPlatformMovie("2009", "Test", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // Claim slot
        vm.prank(user1);
        uint256 sceneId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        // Update refund percentage to 75%
        adventure.setRefundPercentage(75);

        // Request refund
        uint256 balanceBefore = user1.balance;
        vm.prank(user1);
        adventure.requestRefund(sceneId);

        // Should get 75% back (not 50%)
        uint256 expectedRefund = (SCENE_PRICE * 75) / 100;
        assertEq(user1.balance, balanceBefore + expectedRefund);
    }

    function testUpdatedRevenueSharesAffectNewScenes() public {
        // Setup: create movie and genesis
        uint256 movieId = adventure.createPlatformMovie("2009", "Test", movieCreator, SCENE_PRICE);
        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");

        // Claim and confirm first child scene
        vm.prank(user1);
        uint256 childId = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);

        vm.prank(user1);
        adventure.confirmScene(childId, "ipfs://child");

        // Update revenue shares: give parent 30% instead of 20%
        adventure.setRevenueShares(3000, 1000, 500, 4500, 1000);

        // Claim and confirm grandchild scene
        vm.prank(user2);
        uint256 grandchildId = adventure.claimSlot{value: SCENE_PRICE}(childId, 0);

        uint256 user1EarningsBefore = adventure.earnings(user1);

        vm.prank(user2);
        adventure.confirmScene(grandchildId, "ipfs://grandchild");

        // User1 (parent) should get 30% of SCENE_PRICE (not 20%)
        uint256 expectedEarnings = (SCENE_PRICE * 3000) / 10000;
        assertEq(adventure.earnings(user1), user1EarningsBefore + expectedEarnings);
    }
}
