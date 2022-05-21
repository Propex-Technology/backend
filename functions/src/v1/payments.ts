import * as express from "express";
import * as admin from "firebase-admin";
import { checkIfUserExists } from "./users/checkIfUserExists";

const Router: express.Router = express.Router();

export const USERS_COLLECTION = "users";

// Gets a user's data by looking at the request's auth token.
Router.post("/issuePayment",
  async function (req: express.Request, res: express.Response) {
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
    }

    // 4. Get & parse data
    const assetId: number = parseInt(req.params.assetId);
    const amount: number = parseInt(req.params.amount);
    const currency: string = req.params.currency;
    if (isNaN(assetId))
      return res.status(400).json({ success: false, error: "Invalid assetId." });
    if (isNaN(amount))
      return res.status(400).json({ success: false, error: "Invalid amount." });
    if (currency !== 'GBP' && currency !== 'USD' && currency !== 'EUR')
      return res.status(400).json({ success: false, error: "Invalid currency." });

    // 5. Take snapshot of NFT owners.


    // 6. Distribute cash to each NFT owner via batched write.


    return res.status(200).json({ success: true });
  });

export default Router;
