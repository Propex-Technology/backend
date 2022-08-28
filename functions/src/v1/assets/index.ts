import * as express from "express";
import * as admin from "firebase-admin";
import { checkIfAssetExists } from "./checkIfAssetExists";
import { checkIfKYCExistsFromAuthToken } from "../users/checkIfUserExists";
import { ethers } from "ethers";
import PropexDealERC20 from "../../abi/PropexDealERC20";
import devKeys, { accountKey } from "../../devKeys";
import { MultiCall } from "@indexed-finance/multicall";

const Router: express.Router = express.Router();

export const ASSETS_COLLECTION = "assets";
const MANAGER_COLLECTION = "managers";
const PRIMARY_SALE_COLLECTION = "primary_offerings";
const OFFERING_RESERVATIONS_COLLECTION = "reservations";
// const PURCHASES_COLLECTION = "purchases";
const ROI_FIELD = "estimatedROI";

// #endregion

// #region Data Classes

/**
 * Response structure for the shortlist request.
 */
class ShortListResponse {
  success = false;
  data: Array<ShortenedAsset> = [];
}

/**
 * A class that represent's an assets' location.
 */
class Location {
  addressLine1 = "";
  addressLine2 = "";
  city = "";
  province = "";
  zip = "";
  googleMapsLink = "";
}

/**
 * A short version of an asset's data, perfect for the front page.
 */
class ShortenedAsset {
  /**
   * Creates a new shortened asset class.
   * @param {number} assetId The assetId of the asset.
   * @param {string} image The main image of the asset.
   * @param {string} propertyType The main property type of the asset.
   * @param {number} totalTokens The total number of tokens for the asset.
   * @param {number} tokenPrice The price of the token in the token currency.
   * @param {string} currency The currency of the token price & ROI.
   * @param {number} estimatedROI The estimated total ROI of the asset.
   * @param {number} cashPayout The annual cash payout of the asset.
   * @param {number} raiseGoal The raise goal of the asset.
   * @param {Location} location The location of the asset.
   * @param {number} purchasedTokens The supply of the token (how much has been minted).
   */
  constructor(assetId: number, image: string, propertyType: string,
    totalTokens: number, tokenPrice: number, currency: string,
    estimatedROI: number, cashPayout: number, raiseGoal: number,
    location: Location, purchasedTokens: number) {
    this.assetId = assetId;
    this.image = image;
    this.currency = currency;
    this.propertyType = propertyType;
    this.totalTokens = totalTokens;
    this.tokenPrice = tokenPrice;
    this.estimatedROI = estimatedROI;
    this.cashPayout = cashPayout;
    this.raiseGoal = raiseGoal;
    this.location = location;
    this.purchasedTokens = purchasedTokens;
  }

  assetId = 0;
  image = "";
  propertyType = "";
  currency = "";
  totalTokens = 0;
  tokenPrice = 0;
  estimatedROI = 0;
  cashPayout = 0;
  purchasedTokens = 0;
  raiseGoal = 0;
  location: Location | undefined;
}

/**
 * A type that has to do with an asset's primary offering.
 */
type PrimaryOffering = {
  assetId: number,
  totalTokens: number,
  tokensLeft: number
}

/**
 * Data that has to do with when a user reserved tokens for purchase.
 */
type Reservation = {
  userId: string,
  assetId: number,
  pendingReserved: number,
  lastUpdated: number,
  purchaseMethod: PurchaseMethod,
  purchaseId?: string
};

enum PurchaseMethod {
  USDC = "USDC", card = "card"
}

// #endregion

Router.get("/get/:assetId",
  async function (req: express.Request, res: express.Response) {
    const assetId: number = parseInt(req.params.assetId);
    const assetIdIsNotAValidNumber: boolean = isNaN(assetId);
    if (assetIdIsNotAValidNumber) {
      res.status(400).json({ success: false, error: "Invalid assetId." });
      return;
    }

    const assetCheck = await checkIfAssetExists(assetId);
    if (!assetCheck.returnedTrue) {
      res.status(400)
        .json({ success: false, error: "Queried assetId does not exist." });
      return;
    }

    // Get manager data
    const assetData = assetCheck.asset.docs[0].data();
    const db = admin.firestore();
    const managerRef = db.collection(MANAGER_COLLECTION)
      .where("managerId", "==", assetData.managerId);
    const managerData = (await managerRef.get()).docs[0].data();

    // Get purchased amount
    const provider = new ethers.providers.JsonRpcProvider(
      devKeys.polygonProvider,
      devKeys.polygonName
    );
    const contract = new ethers.Contract(assetData.contractAddress, PropexDealERC20.abi, provider);
    const purchasedTokens = (await contract.totalSupply() as ethers.BigNumber).toNumber();

    res.status(200).json({ success: true, ...assetData, manager: managerData, purchasedTokens });
    return;
  });

Router.get("/get/shortlist/:limit/:offset",
  async function (req: express.Request, res: express.Response) {
    const offset: number = parseInt(req.params.offset);
    const offsetIsNotAValidNumber: boolean = isNaN(offset);
    const limit: number = parseInt(req.params.limit);
    const limitIsNotAValidNumber: boolean = isNaN(limit);
    if (offsetIsNotAValidNumber || limitIsNotAValidNumber) {
      res.status(400)
        .json({
          success: false,
          error: "Offset and limit must be integers.",
        });
      return;
    }

    const db = admin.firestore();
    const assetRef = db.collection(ASSETS_COLLECTION)
      .orderBy(ROI_FIELD)
      .limit(limit)
      .offset(offset);
    const assetSnapshot = await assetRef.get();

    const provider = new ethers.providers.JsonRpcProvider(
      devKeys.polygonProvider,
      devKeys.polygonName
    );

    const multi = new MultiCall(provider);
    const dealCount = assetSnapshot.docs.length;
    const inputs = [];
    for (let d = 0; d < dealCount; d++) {
      const contractAddress = assetSnapshot.docs[d].data().contractAddress;
      inputs.push({ target: contractAddress, function: "totalSupply", args: [] });
    }
    const tokenSupply: Array<ethers.BigNumber> = (await multi.multiCall(PropexDealERC20.abi, inputs))[1];

    const json: ShortListResponse = { success: true, data: [] };
    assetSnapshot.docs.forEach((doc, i) => {
      const {
        assetId, images, propertyDetails, totalTokens,
        tokenPrice, estimatedROI, cashPayout, currency,
        raiseGoal, location } = doc.data();
      const sAsset = new ShortenedAsset(assetId, images[0],
        propertyDetails.propertyType[0], totalTokens,
        tokenPrice, currency, estimatedROI, cashPayout,
        raiseGoal, location, tokenSupply[i].toNumber());

      json.data.push(sAsset);
    });

    res.status(200).json(json);
    return;
  });

/*
HOW PURCHASES WORK (backend): 08/25/22

Before you purchase an asset, you have to reserve the asset for purchase.
Every user can only have 1 asset+amount reserved at a time
Every asset needs to have a primary_offering entry to dictate how much it has left
  This might be weird and be changed later since we're looking at the blockchain for how much there truly is left

1. User attempts to reserve X amount of shares to purchase

TODO: NEEDS A ROUTINE TO AUTOMATICALLY REMOVE OUTDATED RESERVATIONS
  */

Router.post("/reserveForPurchase",
  async function (req: express.Request, res: express.Response) {
    const assetId: number = parseInt(req.body.assetId);
    const amount: number = parseInt(req.body.amount);
    const purchaseMethod = req.body.purchaseMethod.toString();

    if (isNaN(assetId)) { return res.status(400).json({ success: false, error: "Invalid assetId." }); }
    if (isNaN(amount)) { return res.status(400).json({ success: false, error: "Invalid amount." }); }
    if (!Object.keys(PurchaseMethod).includes(purchaseMethod)) {
      return res.status(400).json({ success: false, error: "Invalid purchase method." });
    }

    // Assert that the asset exists. (TODO: turn into middleware)
    const assetCheck = await checkIfAssetExists(assetId);
    if (!assetCheck.returnedTrue) {
      return res.status(400)
        .json({ success: false, error: "Queried assetId does not exist." });
    }

    // Assert that the user exists + KYC. (TODO: turn into middleware)
    const check = await checkIfKYCExistsFromAuthToken(req, res);
    if (!check.returnedTrue) {
      return res.status(400).json({ success: false, error: "Not authorized." });
    }
    const userId = check.userId;

    // Attempt, in transaction, to purchase.
    let attempts = 0;
    do {
      try {
        const db = admin.firestore();
        const primaryRef = db.collection(PRIMARY_SALE_COLLECTION).doc(assetId.toString());
        const reservationRef = db.collection(OFFERING_RESERVATIONS_COLLECTION)
          .doc(userId);

        await db.runTransaction(async (t) => {
          // 1. Get the data.
          const doc = await t.get(primaryRef);
          const data: PrimaryOffering = doc.data() as PrimaryOffering;

          // 2. If there is space, continue. Else return.
          if (data.tokensLeft < amount) {
            res.status(200).json({ success: false, reason: "Not enough tokens remaining." });
            return; // Premature return
          }

          // 3. Add entry to user's reservation.
          let sameAssetBonus = 0;
          const resDoc = await t.get(reservationRef);
          if (resDoc.exists) {
            // a. Get the previous reservation data
            const resData: Reservation = resDoc.data() as Reservation;

            // b. Update the previous sale that was reserved
            const prevRef = db.collection(PRIMARY_SALE_COLLECTION).doc(resData.assetId.toString());
            const prevResOfferingData = (await t.get(prevRef)).data() as PrimaryOffering;
            if(resData.assetId == assetId) {
              sameAssetBonus = resData.pendingReserved;
            }
            else {
              t.update(prevRef, { tokensLeft: prevResOfferingData.tokensLeft + resData.pendingReserved });
            }

            // c. Override the current reservation
            const newReservation: Reservation = {
              userId,
              assetId,
              pendingReserved: amount,
              lastUpdated: new Date().getTime(),
              purchaseMethod,
              purchaseId: ""
            };
            t.update(reservationRef, newReservation);
          }
          else {
            const newReservation: Reservation = {
              userId,
              assetId,
              pendingReserved: amount,
              lastUpdated: new Date().getTime(),
              purchaseMethod
            };
            t.create(reservationRef, newReservation);
          }

          // 4. Remove from total tokens remaining.
          t.update(primaryRef, { tokensLeft: data.tokensLeft - amount + sameAssetBonus });
        });

        if (purchaseMethod == PurchaseMethod.card) {
          // TODO: make a request to stripe
        }

        res.status(200).json({ success: true });
        return;
      } catch (e) {
        // Await before attempting again.
        console.log(e);
        await new Promise((resolve) => setTimeout(resolve, (attempts + 1) * 0.2));
        attempts++;
      }
    }
    while (attempts < 10);

    res.status(408).json({ success: false, reason: "Timed out." });
    return;
  });

Router.post("/finalizePurchase",
  async function (req: express.Request, res: express.Response) {
    // You should expect some type of information (purchase type)
    // But for now we're just going to assume USDC
    // Also this finalize purchase shouldn't have assetId, amount, or address, that should be in reserveForPurchase
    const assetId: number = parseInt(req.body.assetId);
    const amount: number = parseInt(req.body.amount);
    const address: number = req.body.address;

    const assetCheck = await checkIfAssetExists(assetId);
    if (!assetCheck.returnedTrue) { return res.status(400).json({ success: false, error: "Asset does not exist." }); }
    const assetAddress = assetCheck.asset.docs[0].data().contractAddress;

    // TODO: We turned this off but it's mega insecure so like change it please
    // Assert that the user exists & KYC
    /*
  const check = await checkIfKYCExistsFromAuthToken(req, res);
  if(!check.returnedTrue) {
    return res.status(400).json({ success: false, error: "Not authorized." });
  }
  const userId = check.userId;
  */

    // TODO: check for purchase

    // TODO: check to make sure that it won't mint over

    // Mint NFT
    // NOTICE: asset 0 doesn't work because... IT WASNT DEPLOYED BY PROD!!!
    const provider = new ethers.providers.JsonRpcProvider(
      devKeys.polygonProvider,
      devKeys.polygonName
    );
    const wallet = new ethers.Wallet(accountKey, provider);
    const dealERC = new ethers.Contract(assetAddress, PropexDealERC20.abi, wallet);
    console.log("Beginning transaction on " + assetAddress);
    const transaction = await dealERC.mintForUser(address, amount);

    return res.status(200).json({ success: true, transaction });
  });

if (process.env.NODE_ENV == "development") {
  Router.get("/duplicate/:assetId",
    async function (req: express.Request, res: express.Response) {
      const assetId: number = parseInt(req.params.assetId);
      const assetIdIsNotAValidNumber: boolean = isNaN(assetId);
      if (assetIdIsNotAValidNumber) {
        res.status(400)
          .json({
            success: false,
            error: "AssetId must be valid.",
          });
        return;
      }

      const assetCheck = await checkIfAssetExists(assetId);
      if (!assetCheck.returnedTrue) {
        res.status(400)
          .json({ success: false, error: "Queried assetId does not exist." });
        return;
      }

      const oldData = assetCheck.asset.docs[0].data();
      const db = admin.firestore();
      await db.collection(ASSETS_COLLECTION).doc(assetId.toString()).create(oldData);

      res.status(200).json({ success: true });
    });
}

export default Router;
