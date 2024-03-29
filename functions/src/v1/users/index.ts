import * as express from "express";
import * as admin from "firebase-admin";
import devKeys from "../../devKeys";
import axios from "axios";
import {checkIfUserExists, checkIfUserExistsFromAuthToken} from "./checkIfUserExists";
import {UserBalance} from "../payments";
import {ethers} from "ethers";
import {CallInput, MultiCall} from "@indexed-finance/multicall";
import PropexDealERC20 from "../../abi/PropexDealERC20";

const Router: express.Router = express.Router();

export const USERS_COLLECTION = "users";
const BALANCES_COLLECTION = "balances";
const ASSETS_COLLECTION = "assets";
const DATA_COLLECTION = "data";
const SMART_CONTRACT_DOCUMENT = "smart_contracts";

// Gets a user's data by looking at the request's auth token.
Router.get("/get/",
    async function(req: express.Request, res: express.Response) {
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

      // 3. Fetch data
      const userCheck = await checkIfUserExists(userId);
      // 3a. If data does exist, return it
      if (userCheck.returnedTrue) {
        console.log("User preexisted");
        res.status(200).json({success: true, ...userCheck.userDoc?.data()});
      }
      // 3b. If data doesn't exist, then create a new document & return it
      else {
      // Create new document
        const db = admin.firestore();
        const newData = {
          "userId": userId,
          "wallets": [],
          "name": "",
          "kycStatus": "incomplete",
        };

        // Make a new persona account.
        // This must work, otherwise KYC will not.
        // We try 3 times, and if they don't work, send 500.
        let personaRes; let personaAttempts = 0;
        do {
          personaAttempts++;
          try {
            personaRes = await axios({
              method: "POST",
              url: "https://withpersona.com/api/v1/accounts",
              headers: {
                "Accept": "application/json",
                "Persona-Version": "2021-05-14",
                "Content-Type": "application/json",
                "Authorization": "Bearer " + devKeys.personaKey,
              },
              data: JSON.stringify({
                data: {
                  attributes: {
                    "email-address": authVerification.email,
                    "reference-Id": userId,
                  },
                },
              }),
            });
          }
          catch (err) {
            console.warn(err);
          }
        }
        while (personaRes?.status != 201 && personaAttempts < 3);

        if (personaRes?.status != 201) res.status(500).json(personaRes);

        await db.collection(USERS_COLLECTION).doc(userId).set(newData);

        res.status(200)
            .json({success: true, ...newData});
      }

      return;
    });

// Gets a user's data by looking at the request's auth token.
// Also checks Persona API to verify that the user has been verified.
Router.get("/get/verifyKYC/",
    async function(req: express.Request, res: express.Response) {
    // 1. Check if authentication exists
      const userCheck = await checkIfUserExistsFromAuthToken(req, res);
      if (!userCheck.returnedTrue) {
        return res.status(403).json({
          success: false,
          error: "You do not have permisson.",
        });
      }

      // 2a. If data does exist, begin KYC check.
      const userId = userCheck.userId;
      if (userCheck.returnedTrue) {
        const userData = userCheck.userDoc?.data();

        // No need to begin KYC check if the status is already complete.
        if (userData?.kycStatus === "complete") {
          res.status(200).json({success: true, ...userData});
        }
        // Begin KYC check via Persona if it hasn't completed yet.
        else if (userData != null) {
          const axiosRes = await axios({
            method: "GET",
            url: "https://withpersona.com/api/v1/inquiries",
            params: {"filter[reference-id]": userId},
            headers: {
              "Accept": "application/json",
              "Persona-Version": "2021-05-14",
              "Authorization": "Bearer " + devKeys.personaKey,
            },
          });

          if (axiosRes.status != 200) {
            res.status(500);
            return;
          }

          const resData = axiosRes.data;
          const isCompleted = resData.data.some(
              (x: { attributes: { status: string; }; }) =>
                x.attributes.status == "completed"
          );
          console.log("Completed: " + isCompleted);

          if (isCompleted) {
            const db = admin.firestore();
            userData.kycStatus = "completed";
            await db.collection(USERS_COLLECTION)
                .doc(userId)
                .set(userData);
            res.status(200)
                .json({success: true, ...userData});
          }
        } else {
          res.status(500);
        }
      }
      // 2b. If data doesn't exist, then create a new document & return it.
      // NOTE: If the data doesn't exist already, then the KYC definitely doesn't exist.
      else {
      // Create new document
        const db = admin.firestore();
        const newData = {
          "userId": userId,
          "wallets": [],
          "name": "",
          "kycStatus": "incomplete",
        };
        await db.collection(USERS_COLLECTION).doc(userId).set(newData);

        res.status(200)
            .json({success: true, ...newData});
      }

      return;
    });

Router.get("/balances/:address",
    async function(req: express.Request, res: express.Response) {
    // 1. Check if authentication exists
    // const userCheck = await checkIfUserExistsFromAuthToken(req, res);
    // if (!userCheck.returnedTrue) return;

      const address: string = req.params.address;
      if (!address.startsWith("0x")) {
        return res.status(400).json({
          success: false,
          error: "Provide a valid address.",
        });
      }

      // 2. Get user balances
      const db = admin.firestore();
      const balRef = db.collection(BALANCES_COLLECTION).doc(address.toLowerCase());
      let bal: UserBalance; const balData = await balRef.get();
      if (!balData.exists) {
        bal = {
          "USD": 0,
          "EUR": 0,
          "GBP": 0,
        };
      }
      else bal = balData.data() as UserBalance;

      // 3. Check blockchain for their NFTs
      const provider = new ethers.providers.JsonRpcProvider(
          devKeys.polygonProvider,
          devKeys.polygonName
      );
      const multi = new MultiCall(provider);
      const idToContract: number[] = [];
      const inputs: CallInput[] | { target: string; function: string; args: string[]; }[] = [];
      const contractData = (await db.collection(DATA_COLLECTION).doc(SMART_CONTRACT_DOCUMENT).get()).data() as Object;
      for (const [id, contract] of Object.entries(contractData)) {
        idToContract.push(parseInt(id));
        inputs.push({target: contract, function: "balanceOf", args: [address]});
      }
      const tokens: Array<ethers.BigNumber> = (await multi.multiCall(PropexDealERC20.abi, inputs))[1];

      // 4. Format correctly
      const tokenData: any[] = [];
      for (let t = 0; t < tokens.length; t++) {
        if (tokens[t].isZero()) continue;
        const document = await db
            .collection(ASSETS_COLLECTION)
            .doc(idToContract[t].toString())
            .get();
        tokenData[t] = {
          balance: tokens[t].toNumber(),
          ...document.data(),
        };
      }

      // 5. Return the shit that you just made
      return res.status(200).json({
        balance: bal,
        tokenData,
      });
    });

export default Router;
