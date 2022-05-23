import * as express from "express";
import * as admin from "firebase-admin";
import { checkIfUserExistsFromAuthToken } from "./users/checkIfUserExists";
import { checkIfAssetExists } from "./assets/checkIfAssetExists";
const Moralis = require('moralis/node');
//import Moralis from 'moralis/node';
// import PropexDealNFT from "../abi/PropexDealNFT";

const Router: express.Router = express.Router();

const BALANCES_COLLECTION = 'balances';
const DISTRIBUTION_HISTORY_COLLECTION = 'distribution_history';
const TRANSACTION_HISTORY_COLLECTION = 'transaction_history';

type TransactionLog = {
  distributionId?: string,
  walletAddress: string,
  amount: number, 
  date: number, 
  assetId: number,
  assetQuantity: number,
}

// Gets a user's data by looking at the request's auth token.
Router.post("/issuePayment",
  async function (req: express.Request, res: express.Response) {

    // 1. Fetch data & authenticate that user is admin
    const userCheck = await checkIfUserExistsFromAuthToken(req, res, 
      async (data) => data.userDoc !== undefined && data.userDoc.data()?.isAdmin === true
    );

    // 2. Get & parse data
    const assetId: number = parseInt(req.body.assetId);
    const amount: number = parseFloat(req.body.amount);
    const currency: string = req.body.currency;
    if (isNaN(assetId)) { return res.status(400).json({ success: false, error: "Invalid assetId." }); }
    if (isNaN(amount)) { return res.status(400).json({ success: false, error: "Invalid amount." }); }
    if (currency !== "GBP" && currency !== "USD" && currency !== "EUR") { return res.status(400).json({ success: false, error: "Invalid currency." }); }
    const assetCheck = await checkIfAssetExists(assetId);
    if (!assetCheck.returnedTrue) { return res.status(400).json({ success: false, error: "Asset does not exist." }); }
    const assetAddress = assetCheck.asset.docs[0].data().contractAddress;
    if (assetAddress == null) { return res.status(400).json({ success: false, error: "Asset has no contract." }); }

    // 3. Take snapshot of NFT owners.
    const nftOwnership = await Moralis.Web3API.token.getNFTOwners({
      chain: process.env.NODE_ENV == "development" ? "mumbai" : "polygon",
      address: assetAddress,
    });
    const ownersToCount: { [key: string]: number } = {};
    nftOwnership.result?.forEach((nft: { owner_of: string; }) => {
      const owner = nft.owner_of;
      if (ownersToCount[owner] == null) ownersToCount[owner] = 1;
      else ownersToCount[owner] += 1;
    });
    const totalTokens: number = nftOwnership.total;

    // 4. Begin log
    const db = admin.firestore();
    const owners = Object.keys(ownersToCount);
    let distributionId = "";
    try {
      const newDistributionLog = await db.collection(DISTRIBUTION_HISTORY_COLLECTION).add({
        assetId: assetId,
        amount: amount,
        ownerCount: owners.length,
        date: Date.now(),
        issuer: userCheck?.userId
      });
      distributionId = newDistributionLog.id;
    }
    catch {
      return res.status(500).json({ success: false, error: 'Error with beginning log.' });
    }


    // 7. Distribute cash to each NFT owner via batched write.
    const bal = db.collection(BALANCES_COLLECTION);
    let totalWritten = 0, transactionHistory: Array<TransactionLog> = [];
    while (totalWritten < owners.length) {
      await db.runTransaction(async (t) => {
        for(let w = 0; w < 500 && totalWritten < owners.length; w++, totalWritten++) {
          const owner = owners[totalWritten];
          const portion = amount * (ownersToCount[owner] / totalTokens);
          const incr = admin.firestore.FieldValue.increment(portion);
          const docRef = bal.doc(owner);
          t.set(docRef, { [currency]: incr }, { merge: true });
          transactionHistory.push({ 
            distributionId,
            walletAddress: owner,
            amount: portion, 
            date: Date.now(), 
            assetId: assetId,
            assetQuantity: ownersToCount[owner]
          });
        }
      });
    }

    // 8. Transaction logging.
    transactionHistory.forEach(transaction => 
      db.collection(TRANSACTION_HISTORY_COLLECTION).add(transaction)
    );

    return res.status(200).json({ success: true });
  });

export default Router;
