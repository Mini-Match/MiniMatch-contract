interface IDepositUserContract {
	function depositFundClient() external payable;
	function addContractToWhitelist(address _contractAddress) external;
	function removeContractFromWhitelist(address _contractAddress) external;
	function setMinBalanceClient(uint256 _limit) external;
	function withdrawFundClient(uint256 _amount) external;
	function checkClientFund(address _clientAddress) external view returns (uint256);
	function checkEffectiveBalance(address _clientAddress) external view returns (uint256);
	function checkMinBalanceSupra() external view returns (uint256);
	function checkMinBalance(address _clientAddress) external view returns(uint256);
	function countTotalWhitelistedContractByClient(address _clientAddress) external view returns (uint256);
	function getSubscriptionInfoByClient(address _clientAddress) external view returns (uint256, uint256, bool);
	function isMinimumBalanceReached(address _clientAddress) external view returns (bool);
	function listAllWhitelistedContractByClient(address _clientAddress) external view returns (address[] memory);	
}