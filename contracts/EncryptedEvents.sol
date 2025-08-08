// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title EncryptedEvents
 * @notice Minimal example of emitting confidential events on Oasis Sapphire.
 */
contract EncryptedEvents {
    event Encrypted(bytes32 nonce, bytes ciphertext);

    // Number of random bytes used to construct the 32-byte nonce for Deoxys-II
    uint256 private constant NONCE_SIZE_BYTES = 32;

    /// @notice Encrypts a message with a caller-provided symmetric key and emits it.
    /// @dev Pass the key over an encrypted transaction (default when using the Sapphire Hardhat plugin).
    function emitEncrypted(bytes32 key, string calldata message) external {
        bytes memory empty = bytes("");
        bytes32 nonce = bytes32(Sapphire.randomBytes(NONCE_SIZE_BYTES, empty));
        bytes memory cipher = Sapphire.encrypt(
            key,
            nonce,
            bytes(message),
            empty
        );
        emit Encrypted(nonce, cipher);
    }

    /// @notice Same as emitEncrypted, but binds encryption to msg.sender via AAD for authenticity.
    function emitEncryptedWithAad(
        bytes32 key,
        string calldata message
    ) external {
        bytes memory empty = bytes("");
        bytes32 nonce = bytes32(Sapphire.randomBytes(NONCE_SIZE_BYTES, empty));
        // AAD must exactly match off-chain bytes (20-byte address).
        bytes memory aad = abi.encodePacked(msg.sender);
        bytes memory cipher = Sapphire.encrypt(
            key,
            nonce,
            bytes(message),
            aad
        );
        emit Encrypted(nonce, cipher);
    }
}
