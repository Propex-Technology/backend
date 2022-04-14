import * as express from "express";
import * as admin from "firebase-admin";
import {checkIfAssetExists} from "./checkIfAssetExists";

const Router: express.Router = express.Router();

export const ASSETS_COLLECTION = "assets";
const MANAGER_COLLECTION = "managers";
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
   */
  constructor(assetId: number, image: string, propertyType: string,
      totalTokens: number, tokenPrice: number, currency: string,
      estimatedROI: number, cashPayout: number, raiseGoal: number,
      location: Location) {
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

// #endregion


Router.get("/get/:assetId",
    async function(req: express.Request, res: express.Response) {
      const assetId: number = parseInt(req.params.assetId);
      const assetIdIsNotAValidNumber: boolean = isNaN(assetId);
      if (assetIdIsNotAValidNumber) {
        res.status(400).json({success: false, error: "Invalid assetId."});
        return;
      }

      const assetCheck = await checkIfAssetExists(assetId);
      if (!assetCheck.returnedTrue) {
        res.status(400)
            .json({success: false, error: "Queried assetId does not exist."});
        return;
      }

      // Get manager data
      const assetData = assetCheck.asset.docs[0].data();
      const db = admin.firestore();
      const managerRef = db.collection(MANAGER_COLLECTION)
          .where("managerId", "==", assetData.managerId);
      const managerData = (await managerRef.get()).docs[0].data();

      res.status(200).json({success: true, ...assetData, manager: managerData});
      return;
    });

Router.get("/get/shortlist/:limit/:offset",
    async function(req: express.Request, res: express.Response) {
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

      const json: ShortListResponse = {success: true, data: []};
      assetSnapshot.docs.forEach((doc) => {
        const {
          assetId, images, propertyDetails, totalTokens,
          tokenPrice, estimatedROI, cashPayout, currency,
          raiseGoal, location} = doc.data();
        const sAsset = new ShortenedAsset(assetId, images[0],
            propertyDetails.propertyType[0], totalTokens,
            tokenPrice, currency, estimatedROI, cashPayout,
            raiseGoal, location);
        // @TODO: set sAsset purchasedTokens by querying blockchain

        json.data.push(sAsset);
      });

      res.status(200).json(json);
      return;
    });

if (process.env.NODE_ENV == "development") {
  Router.get("/duplicate/:assetId",
      async function(req: express.Request, res: express.Response) {
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
              .json({success: false, error: "Queried assetId does not exist."});
          return;
        }

        const oldData = assetCheck.asset.docs[0].data();
        const db = admin.firestore();
        db.collection(ASSETS_COLLECTION).add(oldData);

        res.status(200).json({success: true});
      });
}

export default Router;
