/*

import * as express from "express";

import * as admin from "firebase-admin";

const Router: express.Router = express.Router();

const MARKET_COLLECTION = "market";

Router.get("/get/:assetId",
  async function (req: express.Request, res: express.Response) {
    // 1. Get data cached within the database.

    // 2. Check latest block.

    // 3. Read stat

    // 4. 

    // 2. Get user from auth token.
    const authVerification = await admin.auth().verifyIdToken(authToken);
    const userId = authVerification.uid;

    // 3. Fetch data
    const userCheck = await checkIfUserExists(userId);
    // 3a. If data does exist, return it
    if (userCheck.returnedTrue)
      res.status(200).json({ success: true, ...userCheck.asset });
    // 3b. If data doesn't exist, then create a new document & return it
    else {
      // Create new document
      const db = admin.firestore();
      const ref = await db.collection(USERS_COLLECTION).add({
        "userId": userId,
        "wallet": "",
        "name": "",
        "kyc": ""
      });
      const data = await ref.get();

      res.status(200)
        .json({ success: true, ...data.data() });
    }

    return;
  });
*/
export default Router;
