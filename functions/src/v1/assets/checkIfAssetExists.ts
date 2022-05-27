import * as admin from "firebase-admin";

export const ASSETS_COLLECTION = "assets";

// #region Helper Functions
// Feel free to move this into its own file if you feel that it is necessary.
/**
 * Checks to see if an asset exists.
 * @param {number} assetId The id of the asset (equal to the NFT's id).
 * @return {{returnedTrue: boolean, asset: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>}}
 *  if the asset exists, asset: the asset's snapshot if it exists.
 */
export async function checkIfAssetExists(assetId: number):
  Promise<{
    returnedTrue: boolean;
    asset: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
  }> {
  const db = admin.firestore();
  const assetRef = db.collection(ASSETS_COLLECTION)
      .where("assetId", "==", assetId);
  const assetSnapshot = await assetRef.get();
  return {returnedTrue: assetSnapshot.size > 0, asset: assetSnapshot};
}
