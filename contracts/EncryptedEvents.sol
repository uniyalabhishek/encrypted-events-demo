// contracts/EncryptedEvents.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title EncryptedEvents
 * @notice Minimal example of emitting **confidential** events on Oasis Sapphire.
 */

contract EncryptedEvents {
    event Encrypted(bytes32 nonce, bytes ciphertext);

    function emitEncrypted(bytes32 key, string calldata message) external {
        bytes32 nonce = bytes32(Sapphire.randomBytes(32, ""));
        bytes memory cipher = Sapphire.encrypt(
            key,
            nonce,
            abi.encode(message),
            ""
        );
        emit Encrypted(nonce, cipher);
    }
}
