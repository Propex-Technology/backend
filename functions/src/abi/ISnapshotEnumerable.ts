export default {
    "abi": [
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "page",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "perPage",
              "type": "uint256"
            }
          ],
          "name": "entriesFromLastSnapshot",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
            },
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "entriesInLastSnapshot",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ],
};