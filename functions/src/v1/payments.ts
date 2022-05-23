import * as express from "express";
import * as admin from "firebase-admin";
//import { checkIfUserExists } from "./users/checkIfUserExists";
import { checkIfAssetExists } from "./assets/checkIfAssetExists";
const Moralis = require('moralis/node');
//import Moralis from 'moralis/node';
// import PropexDealNFT from "../abi/PropexDealNFT";

const Router: express.Router = express.Router();

const BALANCES_COLLECTION = 'balances';

// Gets a user's data by looking at the request's auth token.
Router.post("/issuePayment",
  async function (req: express.Request, res: express.Response) {
    /*
    // 1. Check if authentication exists
    const authToken = req.get("authorization");
    if (authToken == null) {
      return res.status(403).json({
        success: false,
        error: "You do not have permisson.",
      });
    }

    // 2. Get user from auth token.
    const authVerification = await admin.auth().verifyIdToken(authToken);
    const userId = authVerification.uid;

    // 3. Fetch data & authenticate that user is admin
    const userCheck = await checkIfUserExists(userId);
    if (!userCheck.returnedTrue || userCheck.userDoc.data()?.isAdmin !== true) {
      return res.status(403).json({
        success: false,
        error: "You do not have permisson.",
      });
    }*/

    // 4. Get & parse data
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

    // 5. Take snapshot of NFT owners.
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

    // 6. Distribute cash to each NFT owner via batched write.
    const db = admin.firestore();
    const bal = db.collection(BALANCES_COLLECTION);
    const owners = Object.keys(ownersToCount);
    let totalWritten = 0;
    while (totalWritten < owners.length) {
      await db.runTransaction(async (t) => {
        // a. Predetermine how many reads+writes are necessary.
        //    (500 max operations, 250 max read+writes).
        let numReadWrites = 0;
        if(owners.length > 250 + totalWritten) numReadWrites = 250;
        else numReadWrites = owners.length - totalWritten;

        // b. Read all documents.
        const readDocs = [];
        for(let r = 0; r < numReadWrites; r++) {
          const owner = owners[totalWritten + r];
          readDocs[r] = await t.get(bal.doc(owner));
        }

        // c. Write all documents.
        for(let w = 0; w < numReadWrites; w++) {
          const owner = owners[totalWritten + w];
          const portion = amount * (ownersToCount[owner] / totalTokens);
          console.log(portion, amount, ownersToCount[owner], totalTokens);

          const docRef = bal.doc(owner);
          const doc = readDocs[w];
          if(!doc.exists) t.set(docRef, { [currency]: portion });
          else if (doc.data()?.[currency] == null) t.update(docRef, { [currency]: portion });
          else {
            const incr = admin.firestore.FieldValue.increment(portion);
            t.update(bal.doc(owner), { [currency]: incr });
          }
        }

        // d. Add total amount of read + writes.
        totalWritten += numReadWrites;
      });
    }

    return res.status(200).json({ success: true });
  });

export default Router;
