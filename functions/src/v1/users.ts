import * as express from "express";
import * as admin from "firebase-admin";

const Router: express.Router = express.Router();

const USERS_COLLECTION = "users";

// #region Helper Functions
// Feel free to move this into its own file if you feel that it is necessary.

/**
 * Checks to see if a user document exists.
 * @param {number} userId The id of the asset (equal to the NFT's id).
 * @return {{returnedTrue: boolean, asset: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>}}
 * returnedTrue: if the user document exists, user: the asset's snapshot if it exists.
 */
async function checkIfUserExists(userId: string) {
  const db = admin.firestore();
  const assetRef = db.collection(USERS_COLLECTION)
      .where("userId", "==", userId);
  const userSnapshot = await assetRef.get();
  return {returnedTrue: userSnapshot.size > 0, asset: userSnapshot};
}

Router.get("/get/",
  async function (req: express.Request, res: express.Response) {
    // 1. Check if authentication exists
    const authToken = req.get('authorization');
    if (authToken == null)
      return res.status(403).json({ success: false, error: "You do not have permisson." });

    // 2. Get user from auth token.
    const authVerification = await admin.auth().verifyIdToken(authToken);
    const userId = authVerification.uid;

    // 3. Fetch data
    const userCheck = await checkIfUserExists(userId);
    // 3a. If data does exist, return it
    if(userCheck.returnedTrue)
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

export default Router;
