import * as express from "express";
import * as admin from "firebase-admin";

const Router: express.Router = express.Router();

const ASSETS_COLLECTION = "assets";

// #region Helper Functions
// Feel free to move this into its own file if you feel that it is necessary.

/**
 * Checks to see if an asset exists.
 * @param {number} assetId The id of the asset (equal to the NFT's id).
 * @return {{returnedTrue: boolean, asset: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>}}
 *  if the asset exists, asset: the asset's snapshot if it exists.
 */
async function checkIfAssetExists(assetId: number) {
  const db = admin.firestore();
  const assetRef = db.collection(ASSETS_COLLECTION)
      .where("assetId", "==", assetId);
  const assetSnapshot = await assetRef.get();
  return {returnedTrue: assetSnapshot.size > 0, asset: assetSnapshot};
}

// #endregion


Router.get("/:assetId",
    async function(req: express.Request, res: express.Response) {
      const assetId: number = parseInt(req.params.assetId);
      const assetIdIsNotAValidNumber: boolean = isNaN(assetId);
      if (assetIdIsNotAValidNumber) {
        res.status(400).json({success: false, error: "Invalid assetId."});
        return;
      }

      const assetCheck = await checkIfAssetExists(assetId);
      if (!assetCheck.returnedTrue) {
        res.status(400).json({success: false, error: "Invalid assetId."});
        return;
      }

      res.status(200).json({success: true, ...assetCheck.asset});
      return;
    });

export default Router;
