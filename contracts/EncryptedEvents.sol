// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title EncryptedEvents
 * @notice Minimal example of emitting confidential events on Oasis Sapphire.
 *
 * Event includes the sender (indexed) for easier filtering and AAD binding.
 */
contract EncryptedEvents {
    event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);

    // Number of random bytes used to construct the 32-byte nonce for Deoxys-II
    uint256 private constant NONCE_SIZE_BYTES = 32;

    /// @notice Encrypts a message with a caller-provided symmetric key and emits it.
    /// @dev Pass the key over an encrypted transaction (default when using the Sapphire Hardhat plugin).
    function emitEncrypted(bytes32 key, bytes calldata message) external {
        // Domain-separated randomness for nonce generation.
        bytes memory pers = bytes("EncryptedEvents:nonce");
        bytes32 nonce = bytes32(Sapphire.randomBytes(NONCE_SIZE_BYTES, pers));
        bytes memory cipher = Sapphire.encrypt(key, nonce, message, bytes(""));
        emit Encrypted(msg.sender, nonce, cipher);
    }

    /// @notice Same as emitEncrypted, but binds encryption to msg.sender via AAD for authenticity.
    function emitEncryptedWithAad(bytes32 key, bytes calldata message) external {
        // Domain-separated randomness for nonce generation.
        bytes memory pers = bytes("EncryptedEvents:nonce");
        bytes32 nonce = bytes32(Sapphire.randomBytes(NONCE_SIZE_BYTES, pers));

        // AAD must exactly match off-chain bytes (20-byte address).
        bytes memory aad = abi.encodePacked(msg.sender);
        bytes memory cipher = Sapphire.encrypt(key, nonce, message, aad);
        emit Encrypted(msg.sender, nonce, cipher);
    }
}
