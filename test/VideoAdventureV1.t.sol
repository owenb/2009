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

    // ============ DETAILED REVENUE FLOW TEST WITH LOGGING ============

    /**
     * @notice Comprehensive test that logs detailed fund distribution flow across 5 generations
     * @dev This test demonstrates the complete lifecycle of scene creation and revenue distribution
     *      including how funds flow backward through the scene tree to reward all ancestors
     */
    function testDetailedRevenueFlowWithLogging() public {
        console2.log("\n==========================================================");
        console2.log("DETAILED REVENUE FLOW TEST - MULTI-GENERATION SCENE TREE");
        console2.log("==========================================================\n");

        console2.log("CONFIGURATION:");
        console2.log("  Scene Price: 0.007 ETH (7000000000000000 wei)");
        console2.log("  Revenue Split:");
        console2.log("    - Parent Creator:        20% (2000 basis points)");
        console2.log("    - Grandparent Creator:   10% (1000 basis points)");
        console2.log("    - Great-GP Creator:       5% ( 500 basis points)");
        console2.log("    - Movie Creator:         55% (5500 basis points)");
        console2.log("    - Platform Treasury:     10% (1000 basis points)");
        console2.log("                           -----");
        console2.log("                           100% (10000 basis points)\n");

        // ====== PHASE 1: Setup Movie and Genesis ======
        console2.log("PHASE 1: Creating Movie and Genesis Scene");
        console2.log("------------------------------------------");

        uint256 movieId = adventure.createPlatformMovie("2009", "The First Decision", movieCreator, SCENE_PRICE);
        console2.log("  Movie Created:");
        console2.log("    - Movie ID:", movieId);
        console2.log("    - Movie Creator:", movieCreator);
        console2.log("    - Scene Price: 0.007 ETH\n");

        uint256 genesisId = adventure.createGenesisScene(movieId, "ipfs://genesis");
        console2.log("  Genesis Scene Minted:");
        console2.log("    - Scene ID:", genesisId);
        console2.log("    - Creator (Movie Creator):", movieCreator);
        console2.log("    - Slot: 255 (genesis special slot)");
        console2.log("    - NFT Owner:", adventure.ownerOf(genesisId), "\n");

        // Create additional users for deep tree
        address user4 = address(0x6);
        address user5 = address(0x7);
        vm.deal(user4, 10 ether);
        vm.deal(user5, 10 ether);

        // ====== PHASE 2: First Generation (Child of Genesis) ======
        console2.log("\n==========================================================");
        console2.log("PHASE 2: Creating Generation 1 (Child of Genesis)");
        console2.log("==========================================================\n");

        vm.prank(user1);
        uint256 gen1Scene = adventure.claimSlot{value: SCENE_PRICE}(genesisId, 0);
        console2.log("  User1 Claims Slot A under Genesis");
        console2.log("    - Scene ID:", gen1Scene);
        console2.log("    - Payment: 0.007 ETH");
        console2.log("    - Status: ESCROWED (awaiting confirmation)\n");

        // Snapshot balances before confirmation
        uint256 movieCreatorBefore = adventure.earnings(movieCreator);
        uint256 treasuryBefore = adventure.earnings(treasury);

        vm.prank(user1);
        adventure.confirmScene(gen1Scene, "ipfs://gen1");

        console2.log("  User1 Confirms Scene - Distribution Executed:");
        console2.log("    - NFT Minted to User1:", adventure.ownerOf(gen1Scene));
        console2.log("\n  REVENUE DISTRIBUTION (0.007 ETH):");
        console2.log("    [X] Parent:         N/A (genesis is movie creator)");
        console2.log("    [X] Grandparent:    N/A (no grandparent)");
        console2.log("    [X] Great-GP:       N/A (no great-grandparent)");

        uint256 movieCreatorEarned = adventure.earnings(movieCreator) - movieCreatorBefore;
        uint256 treasuryEarned = adventure.earnings(treasury) - treasuryBefore;

        console2.log("    [+] Movie Creator:  %s wei (55%% base + 35%% unclaimed ancestors = 90%%)", movieCreatorEarned);
        console2.log("    [+] Platform:       %s wei (10%%)", treasuryEarned);
        console2.log("\n  EARNINGS SNAPSHOT:");
        console2.log("    - Movie Creator Total: %s wei", adventure.earnings(movieCreator));
        console2.log("    - Treasury Total:      %s wei", adventure.earnings(treasury));
        console2.log("    - User1 Total:         %s wei\n", adventure.earnings(user1));

        // ====== PHASE 3: Second Generation (Grandchild of Genesis) ======
        console2.log("\n==========================================================");
        console2.log("PHASE 3: Creating Generation 2 (Grandchild of Genesis)");
        console2.log("==========================================================\n");

        vm.prank(user2);
        uint256 gen2Scene = adventure.claimSlot{value: SCENE_PRICE}(gen1Scene, 1);
        console2.log("  User2 Claims Slot B under Gen1 Scene");
        console2.log("    - Scene ID:", gen2Scene);
        console2.log("    - Parent Scene:", gen1Scene, "(owned by User1)");
        console2.log("    - Payment: 0.007 ETH\n");

        // Snapshot all relevant balances
        uint256 user1Before = adventure.earnings(user1);
        movieCreatorBefore = adventure.earnings(movieCreator);
        treasuryBefore = adventure.earnings(treasury);

        vm.prank(user2);
        adventure.confirmScene(gen2Scene, "ipfs://gen2");

        console2.log("  User2 Confirms Scene - Distribution Executed:");
        console2.log("    - NFT Minted to User2:", adventure.ownerOf(gen2Scene));
        console2.log("\n  REVENUE DISTRIBUTION (0.007 ETH):");

        uint256 user1Earned = adventure.earnings(user1) - user1Before;
        movieCreatorEarned = adventure.earnings(movieCreator) - movieCreatorBefore;
        treasuryEarned = adventure.earnings(treasury) - treasuryBefore;

        console2.log("    [+] Parent (User1):       %s wei (20%%)", user1Earned);
        console2.log("    [+] Grandparent (Genesis): %s wei (10%% -> Movie Creator)", (SCENE_PRICE * 1000) / 10000);
        console2.log("    [X] Great-GP:             N/A (no great-grandparent)");
        console2.log("    [+] Movie Creator:        %s wei (55%% + 10%% grandparent + 5%% great-GP = 70%%)", movieCreatorEarned);
        console2.log("    [+] Platform:             %s wei (10%%)", treasuryEarned);

        console2.log("\n  EARNINGS SNAPSHOT:");
        console2.log("    - User1 Total:         %s wei (+%s)", adventure.earnings(user1), user1Earned);
        console2.log("    - Movie Creator Total: %s wei (+%s)", adventure.earnings(movieCreator), movieCreatorEarned);
        console2.log("    - Treasury Total:      %s wei (+%s)", adventure.earnings(treasury), treasuryEarned);
        console2.log("    - User2 Total:         %s wei\n", adventure.earnings(user2));

        // ====== PHASE 4: Third Generation (Great-Grandchild of Genesis) ======
        console2.log("\n==========================================================");
        console2.log("PHASE 4: Creating Generation 3 (Great-Grandchild of Genesis)");
        console2.log("==========================================================\n");

        vm.prank(user3);
        uint256 gen3Scene = adventure.claimSlot{value: SCENE_PRICE}(gen2Scene, 2);
        console2.log("  User3 Claims Slot C under Gen2 Scene");
        console2.log("    - Scene ID:", gen3Scene);
        console2.log("    - Parent Scene:", gen2Scene, "(owned by User2)");
        console2.log("    - Grandparent Scene:", gen1Scene, "(owned by User1)");
        console2.log("    - Payment: 0.007 ETH\n");

        // Snapshot all balances
        user1Before = adventure.earnings(user1);
        uint256 user2Before = adventure.earnings(user2);
        movieCreatorBefore = adventure.earnings(movieCreator);
        treasuryBefore = adventure.earnings(treasury);

        vm.prank(user3);
        adventure.confirmScene(gen3Scene, "ipfs://gen3");

        console2.log("  User3 Confirms Scene - Distribution Executed:");
        console2.log("    - NFT Minted to User3:", adventure.ownerOf(gen3Scene));
        console2.log("\n  REVENUE DISTRIBUTION (0.007 ETH):");

        user1Earned = adventure.earnings(user1) - user1Before;
        uint256 user2Earned = adventure.earnings(user2) - user2Before;
        movieCreatorEarned = adventure.earnings(movieCreator) - movieCreatorBefore;
        treasuryEarned = adventure.earnings(treasury) - treasuryBefore;

        console2.log("    [+] Parent (User2):       %s wei (20%%)", user2Earned);
        console2.log("    [+] Grandparent (User1):  %s wei (10%%)", user1Earned);
        console2.log("    [+] Great-GP (Genesis):   %s wei (5%% -> Movie Creator)", (SCENE_PRICE * 500) / 10000);
        console2.log("    [+] Movie Creator:        %s wei (55%% + 5%% great-GP = 60%%)", movieCreatorEarned);
        console2.log("    [+] Platform:             %s wei (10%%)", treasuryEarned);

        console2.log("\n  EARNINGS SNAPSHOT:");
        console2.log("    - User1 Total:         %s wei (+%s)", adventure.earnings(user1), user1Earned);
        console2.log("    - User2 Total:         %s wei (+%s)", adventure.earnings(user2), user2Earned);
        console2.log("    - Movie Creator Total: %s wei (+%s)", adventure.earnings(movieCreator), movieCreatorEarned);
        console2.log("    - Treasury Total:      %s wei (+%s)", adventure.earnings(treasury), treasuryEarned);
        console2.log("    - User3 Total:         %s wei\n", adventure.earnings(user3));

        // ====== PHASE 5: Fourth Generation (Full Distribution) ======
        console2.log("\n==========================================================");
        console2.log("PHASE 5: Creating Generation 4 (FULL DISTRIBUTION TEST)");
        console2.log("==========================================================\n");

        vm.prank(user4);
        uint256 gen4Scene = adventure.claimSlot{value: SCENE_PRICE}(gen3Scene, 0);
        console2.log("  User4 Claims Slot A under Gen3 Scene");
        console2.log("    - Scene ID:", gen4Scene);
        console2.log("    - Parent Scene:", gen3Scene, "(owned by User3)");
        console2.log("    - Grandparent Scene:", gen2Scene, "(owned by User2)");
        console2.log("    - Great-Grandparent Scene:", gen1Scene, "(owned by User1)");
        console2.log("    - Payment: 0.007 ETH\n");

        // Snapshot all balances
        user1Before = adventure.earnings(user1);
        user2Before = adventure.earnings(user2);
        uint256 user3Before = adventure.earnings(user3);
        movieCreatorBefore = adventure.earnings(movieCreator);
        treasuryBefore = adventure.earnings(treasury);

        vm.prank(user4);
        adventure.confirmScene(gen4Scene, "ipfs://gen4");

        console2.log("  User4 Confirms Scene - Distribution Executed:");
        console2.log("    - NFT Minted to User4:", adventure.ownerOf(gen4Scene));
        console2.log("\n  REVENUE DISTRIBUTION (0.007 ETH) - FULL CHAIN ACTIVE:");

        user1Earned = adventure.earnings(user1) - user1Before;
        user2Earned = adventure.earnings(user2) - user2Before;
        uint256 user3Earned = adventure.earnings(user3) - user3Before;
        movieCreatorEarned = adventure.earnings(movieCreator) - movieCreatorBefore;
        treasuryEarned = adventure.earnings(treasury) - treasuryBefore;

        console2.log("    [+] Parent (User3):           %s wei (20%%)", user3Earned);
        console2.log("    [+] Grandparent (User2):      %s wei (10%%)", user2Earned);
        console2.log("    [+] Great-GP (User1):         %s wei (5%%)", user1Earned);
        console2.log("    [+] Movie Creator:            %s wei (55%%)", movieCreatorEarned);
        console2.log("    [+] Platform:                 %s wei (10%%)", treasuryEarned);
        console2.log("                                  ----------");
        uint256 totalDistributed = user1Earned + user2Earned + user3Earned + movieCreatorEarned + treasuryEarned;
        console2.log("    TOTAL DISTRIBUTED:            %s wei (should equal 0.007 ETH)", totalDistributed);

        // Verify exact distribution
        assertEq(user3Earned, (SCENE_PRICE * 2000) / 10000, "Parent should get exactly 20%");
        assertEq(user2Earned, (SCENE_PRICE * 1000) / 10000, "Grandparent should get exactly 10%");
        assertEq(user1Earned, (SCENE_PRICE * 500) / 10000, "Great-grandparent should get exactly 5%");
        assertEq(movieCreatorEarned, (SCENE_PRICE * 5500) / 10000, "Movie creator should get exactly 55%");
        assertEq(treasuryEarned, (SCENE_PRICE * 1000) / 10000, "Platform should get exactly 10%");
        assertEq(totalDistributed, SCENE_PRICE, "Total distribution must equal scene price");

        console2.log("\n  EARNINGS SNAPSHOT:");
        console2.log("    - User1 Total:         %s wei (+%s)", adventure.earnings(user1), user1Earned);
        console2.log("    - User2 Total:         %s wei (+%s)", adventure.earnings(user2), user2Earned);
        console2.log("    - User3 Total:         %s wei (+%s)", adventure.earnings(user3), user3Earned);
        console2.log("    - Movie Creator Total: %s wei (+%s)", adventure.earnings(movieCreator), movieCreatorEarned);
        console2.log("    - Treasury Total:      %s wei (+%s)", adventure.earnings(treasury), treasuryEarned);
        console2.log("    - User4 Total:         %s wei\n", adventure.earnings(user4));

        // ====== PHASE 6: Fifth Generation (Branch Demonstration) ======
        console2.log("\n==========================================================");
        console2.log("PHASE 6: Creating Generation 5 (BRANCH DEMONSTRATION)");
        console2.log("==========================================================\n");
        console2.log("  Creating two scenes at Gen 5 to show independent distributions:\n");

        // Branch 1: User5 extends Gen4 Scene
        vm.prank(user5);
        uint256 gen5SceneA = adventure.claimSlot{value: SCENE_PRICE}(gen4Scene, 1);

        user1Before = adventure.earnings(user1);
        user2Before = adventure.earnings(user2);
        user3Before = adventure.earnings(user3);
        uint256 user4Before = adventure.earnings(user4);
        movieCreatorBefore = adventure.earnings(movieCreator);
        treasuryBefore = adventure.earnings(treasury);

        vm.prank(user5);
        adventure.confirmScene(gen5SceneA, "ipfs://gen5a");

        console2.log("  Branch A: User5 extends Gen4 (User4's scene)");
        console2.log("    - Parent (User4) earns:       %s wei (20%%)", adventure.earnings(user4) - user4Before);
        console2.log("    - Grandparent (User3) earns:  %s wei (10%%)", adventure.earnings(user3) - user3Before);
        console2.log("    - Great-GP (User2) earns:     %s wei (5%%)", adventure.earnings(user2) - user2Before);
        console2.log("    - Movie Creator earns:        %s wei (55%%)", adventure.earnings(movieCreator) - movieCreatorBefore);
        console2.log("    - Platform earns:             %s wei (10%%)\n", adventure.earnings(treasury) - treasuryBefore);

        // Branch 2: User1 creates another branch at Gen1
        vm.prank(user1);
        uint256 gen2SceneB = adventure.claimSlot{value: SCENE_PRICE}(gen1Scene, 2);

        movieCreatorBefore = adventure.earnings(movieCreator);
        treasuryBefore = adventure.earnings(treasury);

        vm.prank(user1);
        adventure.confirmScene(gen2SceneB, "ipfs://gen2b");

        console2.log("  Branch B: User1 extends Gen1 (their own earlier scene)");
        console2.log("    - Parent (User1/Genesis) earns: %s wei (20%% -> but User1 is parent!)", (SCENE_PRICE * 2000) / 10000);
        console2.log("    - Grandparent (Genesis) earns:  %s wei (10%% -> Movie Creator)", (SCENE_PRICE * 1000) / 10000);
        console2.log("    - Movie Creator earns:          %s wei (includes grandparent share)", adventure.earnings(movieCreator) - movieCreatorBefore);
        console2.log("    - Platform earns:               %s wei (10%%)\n", adventure.earnings(treasury) - treasuryBefore);

        // ====== PHASE 7: Withdrawal Test ======
        console2.log("\n==========================================================");
        console2.log("PHASE 7: WITHDRAWAL TEST");
        console2.log("==========================================================\n");

        console2.log("  Final Earnings Before Withdrawal:");
        uint256 user1FinalEarnings = adventure.earnings(user1);
        uint256 user2FinalEarnings = adventure.earnings(user2);
        uint256 user3FinalEarnings = adventure.earnings(user3);
        uint256 user4FinalEarnings = adventure.earnings(user4);
        uint256 movieCreatorFinalEarnings = adventure.earnings(movieCreator);
        uint256 treasuryFinalEarnings = adventure.earnings(treasury);

        console2.log("    - User1:        %s wei", user1FinalEarnings);
        console2.log("    - User2:        %s wei", user2FinalEarnings);
        console2.log("    - User3:        %s wei", user3FinalEarnings);
        console2.log("    - User4:        %s wei", user4FinalEarnings);
        console2.log("    - User5:        %s wei", adventure.earnings(user5));
        console2.log("    - Movie Creator: %s wei", movieCreatorFinalEarnings);
        console2.log("    - Treasury:     %s wei\n", treasuryFinalEarnings);

        // Test User2 withdrawal
        uint256 user2BalanceBefore = user2.balance;
        vm.prank(user2);
        adventure.withdrawEarnings();

        console2.log("  User2 Withdraws Earnings:");
        console2.log("    - Amount Withdrawn: %s wei", user2FinalEarnings);
        console2.log("    - New Balance:      %s wei", user2.balance);
        console2.log("    - Earnings Reset:   %s wei", adventure.earnings(user2));
        assertEq(user2.balance, user2BalanceBefore + user2FinalEarnings, "Withdrawal amount incorrect");
        assertEq(adventure.earnings(user2), 0, "Earnings not reset after withdrawal");

        // ====== FINAL SUMMARY ======
        console2.log("\n==========================================================");
        console2.log("FINAL SUMMARY: REVENUE MODEL VERIFICATION");
        console2.log("==========================================================\n");

        uint256 totalRevenue = SCENE_PRICE * 6; // 6 scenes confirmed (excluding gen1Scene that only received distributions)
        console2.log("  Total Revenue Generated:    %s wei (6 scenes @ 0.007 ETH)", totalRevenue);
        console2.log("  Total Earnings Distributed: %s wei",
            adventure.earnings(user1) +
            adventure.earnings(user2) + // Should be 0 after withdrawal
            adventure.earnings(user3) +
            adventure.earnings(user4) +
            adventure.earnings(user5) +
            adventure.earnings(movieCreator) +
            adventure.earnings(treasury) +
            user2FinalEarnings // Add back withdrawn amount
        );

        console2.log("\n  Key Insights:");
        console2.log("    1. Each scene purchase distributes funds to up to 3 ancestors");
        console2.log("    2. Movie creator receives base 55%% + any missing ancestor shares");
        console2.log("    3. Platform always receives exactly 10%%");
        console2.log("    4. Creators earn from ALL descendants (children, grandchildren, etc.)");
        console2.log("    5. Early scenes earn passive income from entire sub-tree below them");
        console2.log("\n  Break-Even Analysis (per GAME_DESIGN.md):");
        console2.log("    - Cost per scene: 0.007 ETH");
        console2.log("    - To break even, need:");
        console2.log("      * 1 child (20%% = 0.0014) +");
        console2.log("      * 3 grandchildren (10%% each = 0.0021) +");
        console2.log("      * 8 great-grandchildren (5%% each = 0.0028)");
        console2.log("      = 0.0063 ETH recovered");
        console2.log("    - After ~12 descendants, scene becomes profitable!\n");

        console2.log("==========================================================");
        console2.log("TEST COMPLETED SUCCESSFULLY");
        console2.log("==========================================================\n");
    }
}
