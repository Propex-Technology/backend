import * as admin from "firebase-admin";
import { USERS_COLLECTION } from "./index";
import * as express from "express";

type UserCheck = {
  returnedTrue: boolean,
  userDoc?: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
}

type UserCheckFromAuthToken = UserCheck & {
  userId: string
}

/**
 * Checks to see if a user document exists.
 * @param {number} userId The uid of the user.
 * @return {Promise<UserCheck>} Information about the user.
 */
export async function checkIfUserExists(userId: string): Promise<UserCheck> {
  const db = admin.firestore();
  const assetRef = db.collection(USERS_COLLECTION).doc(userId);
  const userSnapshot = await assetRef.get();
  return { returnedTrue: userSnapshot.exists, userDoc: userSnapshot };
}

/**
 * Checks to see if a user document exists from a request's auth token.
 * @param {express.Request} req The request object of the route.
 * @param {express.Response} res The response object of the route.
 * @return {Promise<UserCheckFromAuthToken>} Information about user.
 */
export async function checkIfUserExistsFromAuthToken(
  req: express.Request,
  res: express.Response,
  additionalCheck: undefined | ((data: UserCheckFromAuthToken) => Promise<boolean>) = undefined):
  Promise<UserCheckFromAuthToken> {
  // 1. Check if authentication exists
  const authToken = req.get("authorization");
  if (authToken == null) {
    res.status(403).json({
      success: false,
      error: "You do not have permisson.",
    });
    return { returnedTrue: false, userDoc: undefined, userId: "" };
  }

  // 2. Get user from auth token.
  const authVerification = await admin.auth().verifyIdToken(authToken);
  const userId = authVerification.uid;

  // 3. Fetch data & authenticate that user is admin
  const userCheck = await checkIfUserExists(userId);

  // 4. Run additional check if applicable.
  if (additionalCheck !== undefined) {
    const pass = await additionalCheck({ ...userCheck, userId });
    if (!pass) {
      res.status(403).json({
        success: false,
        error: "You do not have permisson.",
      });
    }
    return { returnedTrue: false, userId, userDoc: userCheck.userDoc };
  }

  return { ...userCheck, userId: userId };
}

/**
 * Checks to see if a user document exists & has KYC from a request's auth token.
 * @param {express.Request} req The request object of the route.
 * @param {express.Response} res The response object of the route.
 * @return {Promise<UserCheckFromAuthToken>} Information about user.
 */
export async function checkIfKYCExistsFromAuthToken(
  req: express.Request,
  res: express.Response,
  additionalCheck: undefined | ((data: UserCheckFromAuthToken) => Promise<boolean>) = undefined):
  Promise<UserCheckFromAuthToken> {
  // 1. Check if authentication exists
  const authToken = req.get("authorization");
  if (authToken == null) {
    res.status(403).json({
      success: false,
      error: "You do not have permisson.",
    });
    return { returnedTrue: false, userDoc: undefined, userId: "" };
  }

  // 2. Get user from auth token.
  const authVerification = await admin.auth().verifyIdToken(authToken);
  const userId = authVerification.uid;

  // 3. Fetch data & authenticate that user is KYC compliant.
  // NOTE: 'complete' may not be the correct status. May be 'approved'
  const userCheck = await checkIfUserExists(userId);
  if(userCheck.userDoc?.data()?.kycStatus !== 'complete') {
    res.status(403).json({
      success: false,
      error: 'KYC has not been completed.'
    });
  }

  // 5. Run additional check if applicable.
  if (additionalCheck !== undefined) {
    const pass = await additionalCheck({ ...userCheck, userId });
    if (!pass) {
      res.status(403).json({
        success: false,
        error: "You do not have permisson.",
      });
    }
    return { returnedTrue: false, userId, userDoc: userCheck.userDoc };
  }

  return { ...userCheck, userId: userId };
}
