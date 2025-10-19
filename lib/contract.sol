// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VideoAdventure
 * @dev 2009 - A create your own adventure game
 * Records on-chain ownership of video scenes in a branching narrative
 * Fixed: 8 seconds per video, 0.0007 ETH per second (0.0056 ETH total)
 */
contract VideoAdventure {
    // Price per continuation (can be updated by owner)
    uint256 public scenePrice = 0.000056 ether;

    // Platform treasury address
    address public treasury;

    // Owner of the contract
    address public owner;

    // Simple scene ownership record
    struct Scene {
        uint256 parentId; // Parent scene ID (0 for genesis)
        uint8 slot; // A=0, B=1, C=2
        address creator; // Who owns this scene
        bool exists;
    }

    // Mapping from scene ID to Scene
    mapping(uint256 => Scene) public scenes;

    // Mapping to check if a slot is taken: parent_id => slot => scene_id
    mapping(uint256 => mapping(uint8 => uint256)) public slotTaken;

    // Counter for scene IDs
    uint256 public nextSceneId;

    // Events
    event SceneCreated(
        uint256 indexed sceneId,
        uint256 indexed parentId,
        uint8 slot,
        address indexed creator
    );

    event TreasuryUpdated(address newTreasury);
    event PriceUpdated(uint256 newPrice);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury");
        owner = msg.sender;
        treasury = _treasury;
        nextSceneId = 1;

        // Create genesis scene (intro video) - Scene ID 0
        scenes[0] = Scene({
            parentId: 0,
            slot: 0,
            creator: address(0),
            exists: true
        });
    }

    /**
     * @dev Claim a slot (A, B, or C) on a parent scene
     * @param _parentId Parent scene ID
     * @param _slot Slot to claim: 0=A, 1=B, 2=C
     */
    function claimSlot(uint256 _parentId, uint8 _slot) external payable returns (uint256) {
        require(scenes[_parentId].exists, "Parent scene doesn't exist");
        require(_slot < 3, "Invalid slot (must be 0, 1, or 2)");
        require(slotTaken[_parentId][_slot] == 0, "Slot already taken");
        require(msg.value >= scenePrice, "Insufficient payment");

        uint256 sceneId = nextSceneId++;

        // Record the scene ownership
        scenes[sceneId] = Scene({
            parentId: _parentId,
            slot: _slot,
            creator: msg.sender,
            exists: true
        });

        // Mark slot as taken
        slotTaken[_parentId][_slot] = sceneId;

        // Send payment to treasury
        (bool success, ) = treasury.call{value: msg.value}("");
        require(success, "Payment transfer failed");

        emit SceneCreated(sceneId, _parentId, _slot, msg.sender);

        return sceneId;
    }

    /**
     * @dev Get scene info
     */
    function getScene(uint256 _sceneId) external view returns (
        uint256 parentId,
        uint8 slot,
        address creator,
        bool exists
    ) {
        Scene memory scene = scenes[_sceneId];
        return (scene.parentId, scene.slot, scene.creator, scene.exists);
    }

    /**
     * @dev Check which slots are available for a parent scene
     * @return Array of 3 booleans: [slotA_available, slotB_available, slotC_available]
     */
    function getAvailableSlots(uint256 _parentId) external view returns (bool[3] memory) {
        return [
            slotTaken[_parentId][0] == 0,
            slotTaken[_parentId][1] == 0,
            slotTaken[_parentId][2] == 0
        ];
    }

    /**
     * @dev Get scene IDs for all 3 slots of a parent
     * @return Array of 3 scene IDs (0 if slot is empty)
     */
    function getChildScenes(uint256 _parentId) external view returns (uint256[3] memory) {
        return [
            slotTaken[_parentId][0],
            slotTaken[_parentId][1],
            slotTaken[_parentId][2]
        ];
    }

    /**
     * @dev Get total number of scenes created
     */
    function getTotalScenes() external view returns (uint256) {
        return nextSceneId - 1;
    }

    // Admin functions

    /**
     * @dev Update treasury address
     */
    function setTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury");
        treasury = _newTreasury;
        emit TreasuryUpdated(_newTreasury);
    }

    /**
     * @dev Update price per continuation
     */
    function setPricePerContinuation(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Price must be greater than 0");
        scenePrice = _newPrice;
        emit PriceUpdated(_newPrice);
    }

    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid owner");
        owner = _newOwner;
    }
}
