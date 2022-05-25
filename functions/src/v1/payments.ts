import * as express from "express";
import * as admin from "firebase-admin";
import { checkIfUserExistsFromAuthToken } from "./users/checkIfUserExists";
import { checkIfAssetExists } from "./assets/checkIfAssetExists";
const Moralis = require("moralis/node");
//import Moralis from 'moralis/node';
// import PropexDealNFT from "../abi/PropexDealNFT";

const Router: express.Router = express.Router();

const BALANCES_COLLECTION = "balances";
const DISTRIBUTION_HISTORY_COLLECTION = "distribution_history";
const TRANSACTION_HISTORY_COLLECTION = "transaction_history";
const WITHDRAW_REQUEST_COLLECTION = "withdraw_requests";

type TransactionLog = {
  assetId?: number,
  assetQuantity?: number,
  distributionId?: string,
  method?: string
  walletAddress: string,
  amount: number,
  date: number,
  currency: 'GBP' | 'USD' | 'EUR'
}

type WithdrawRequest = {
  address: string,
  amount: number,
  currency: 'GBP' | 'USD' | 'EUR',
  method: string,
  nonce: number
}

type UserBalance = {
  USD?: number,
  GBP?: number,
  EUR?: number
}

// Gets a user's data by looking at the request's auth token.
Router.post("/issuePayment",
  async function (req: express.Request, res: express.Response) {
    // 1. Fetch data & authenticate that user is admin
    const userCheck = await checkIfUserExistsFromAuthToken(req, res,
      async (data) => data.userDoc !== undefined && data.userDoc.data()?.isAdmin === true
    );
    if (!userCheck.returnedTrue) return;

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
        assetId,
        amount,
        currency,
        ownerCount: owners.length,
        date: Date.now(),
        issuer: userCheck?.userId,
      });
      distributionId = newDistributionLog.id;
    }
    catch {
      return res.status(500).json({ success: false, error: "Error with beginning log." });
    }


    // 5. Distribute cash to each NFT owner via batched write.
    const bal = db.collection(BALANCES_COLLECTION);
    let totalWritten = 0; const transactionHistory: Array<TransactionLog> = [];
    while (totalWritten < owners.length) {
      await db.runTransaction(async (t) => {
        for (let w = 0; w < 500 && totalWritten < owners.length; w++, totalWritten++) {
          const owner = owners[totalWritten];
          const portion = amount * (ownersToCount[owner] / totalTokens);
          const incr = admin.firestore.FieldValue.increment(portion);
          const docRef = bal.doc(owner);
          t.set(docRef, { [currency]: incr }, { merge: true });
          transactionHistory.push({
            distributionId,
            currency,
            walletAddress: owner,
            amount: portion,
            date: Date.now(),
            assetId: assetId,
            assetQuantity: ownersToCount[owner],
          });
        }
      });
    }

    // 8. Transaction logging.
    transactionHistory.forEach((transaction) =>
      db.collection(TRANSACTION_HISTORY_COLLECTION).add(transaction)
    );

    return res.status(200).json({ success: true });
  });

Router.post("/withdrawNonce",
  async function (req: express.Request, res: express.Response) {
    // 1. Fetch data & authenticate that user is authenticated
    const userCheck = await checkIfUserExistsFromAuthToken(req, res);
    if (!userCheck.returnedTrue) return;
    // TODO: KYC check

    // 2. Get data from request.
    const address: string = req.body.address;
    const amount: number = parseFloat(req.body.amount);
    const currency: string = req.body.currency;
    const method: string = req.body.method;
    if (isNaN(amount)) return res.status(400).json({ success: false, error: "Invalid amount." });
    if (currency !== "GBP" && currency !== "USD" && currency !== "EUR") { return res.status(400).json({ success: false, error: "Invalid currency." }); }
    if (method !== "USDC") return res.status(400).json({ success: false, error: "Invalid withdraw method." });

    // 4. Generate nonce & add to collection.
    const nonce = Math.floor(Math.random() * 1000000000000);
    await admin.firestore().collection(WITHDRAW_REQUEST_COLLECTION)
      .doc(userCheck.userId)
      .set({
        address,
        amount,
        currency,
        method,
        nonce
      });
    return res.status(200).json({ success: true, nonce: nonce });
  }
);

Router.post("/finalizeWithdraw",
  async function (req: express.Request, res: express.Response) {
    // 1. Fetch data & authenticate that user
    const userCheck = await checkIfUserExistsFromAuthToken(req, res);
    if (!userCheck.returnedTrue) return;
    // TODO: KYC check

    // 2. Check data.
    const address: string = req.body.address;
    const db = admin.firestore();
    const ref = db.collection(WITHDRAW_REQUEST_COLLECTION).doc(userCheck.userId);
    
    // 3. Check to ensure that wallet addresses are the same.
    const withdrawData: WithdrawRequest = (await ref.get()).data() as WithdrawRequest;
    if(address !== withdrawData.address) 
      return res.status(400).json({ success: false, error: 'Addresses are not the same.' });

    // 4. Check metamask for the nonce message.
    // TODO: ^ this stuff

    // 5. Check for the exchange rate before changing anything, if necessary.

    // 6. Use a transaction & make sure to log it.
    // TODO: check to make sure that the error throwing works
    try {
      await db.runTransaction(async (t) => {
        const balRef = db.collection(BALANCES_COLLECTION).doc(address);
        const userBalances = (await t.get(balRef)).data() as UserBalance;
        const balance = userBalances[withdrawData.currency] ?? 0;
        if(withdrawData.amount < balance) throw Error();
        
        t.delete(ref);
        t.update(balRef, { 
          [withdrawData.currency]: balance - withdrawData.amount 
        });

        // Logging
        const trans: TransactionLog = {
          method: withdrawData.method,
          walletAddress: address,
          amount: -withdrawData.amount,
          date: Date.now(),
          currency: withdrawData.currency
        }
        t.create(db.collection(TRANSACTION_HISTORY_COLLECTION).doc(), trans);
      });
    }
    catch {
      return res.status(400).json({ success: false, error: 'Requested too much.' });
    }

    // 7. Send the money via the requested method.
    //Moralis.Web
  }
);

export default Router;
