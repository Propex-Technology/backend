import * as admin from "firebase-admin";
import { USERS_COLLECTION } from "./index";

// #region Helper Functions
// Feel free to move this into its own file if you feel that it is necessary.
/**
 * Checks to see if a user document exists.
 * @param {number} userId The uid of the user.
 * @return {{returnedTrue: boolean, userDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>}}
 * returnedTrue: if the user document exists, user: the user's snapshot if it exists.
 */
export async function checkIfUserExists(userId: string) {
  const db = admin.firestore();
  const assetRef = db.collection(USERS_COLLECTION).doc(userId);
  const userSnapshot = await assetRef.get();
  return { returnedTrue: userSnapshot.exists, userDoc: userSnapshot };
}
