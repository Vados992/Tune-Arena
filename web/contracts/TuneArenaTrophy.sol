// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
/// @notice Only the organizer can mint a trophy; the public metadata exposes revocation status.
contract TuneArenaTrophy is ERC721URIStorage, Ownable {
    constructor(address organizer) ERC721("Tune Arena Trophy", "TAT") Ownable(organizer) {}
    function award(address recipient, uint256 tokenId, string calldata uri) external onlyOwner {
        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);
    }
}
