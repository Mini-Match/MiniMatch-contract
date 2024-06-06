// SPDX-License-Identifier: MIT

//
//  $$\      $$\  $$$$$$\   $$$$$$\  $$\      $$\ $$$$$$\
//  $$ | $\  $$ |$$  __$$\ $$  __$$\ $$$\    $$$ |\_$$  _|
//  $$ |$$$\ $$ |$$ /  $$ |$$ /  \__|$$$$\  $$$$ |  $$ |
//  $$ $$ $$\$$ |$$$$$$$$ |$$ |$$$$\ $$\$$\$$ $$ |  $$ |
//  $$$$  _$$$$ |$$  __$$ |$$ |\_$$ |$$ \$$$  $$ |  $$ |
//  $$$  / \$$$ |$$ |  $$ |$$ |  $$ |$$ |\$  /$$ |  $$ |
//  $$  /   \$$ |$$ |  $$ |\$$$$$$  |$$ | \_/ $$ |$$$$$$\
//  \__/     \__|\__|  \__| \______/ \__|     \__|\______|
//
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SampleTokenERC20 is ERC20 {
    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
