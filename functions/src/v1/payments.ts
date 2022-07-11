import * as express from "express";
import * as admin from "firebase-admin";
import {checkIfKYCExistsFromAuthToken, checkIfUserExistsFromAuthToken} from "./users/checkIfUserExists";
import {checkIfAssetExists} from "./assets/checkIfAssetExists";
const Moralis = require("moralis/node");
import {ethers, BigNumber} from "ethers";
// import Moralis from "moralis/node";
import axios from "axios";
import {recoverPersonalSignature} from "@metamask/eth-sig-util";
import ISnapshotEnumerable from "../abi/ISnapshotEnumerable";
import keys from "../devKeys";

const Router: express.Router = express.Router();

const BALANCES_COLLECTION = "balances";
const DISTRIBUTION_HISTORY_COLLECTION = "distribution_history";
const TRANSACTION_HISTORY_COLLECTION = "transaction_history";
const WITHDRAW_REQUEST_COLLECTION = "withdraw_requests";

type TransactionLog = {
  assetId?: number,
  assetQuantity?: number,
  distributionId?: string,
  method?: string
  walletAddress: string,
  amount: number,
  date: number,
  currency: "GBP" | "USD" | "EUR"
}

type WithdrawRequest = {
  address: string,
  amount: number,
  currency: "GBP" | "USD" | "EUR",
  method: string,
  nonce: number
}

export type UserBalance = {
  USD?: number,
  GBP?: number,
  EUR?: number
}

type ConversionRates = {
  success: boolean,
  base_code: string,
  conversion_rates: { [name: string]: number }
}

// TODO: change issuePayment so that it is a firebase function
// Gets a user's data by looking at the request's auth token.
Router.post("/issuePayment",
    async function(req: express.Request, res: express.Response) {
    // 1. Fetch data & authenticate that user is admin

      const userCheck = await checkIfUserExistsFromAuthToken(req, res);
      if (!userCheck.returnedTrue) return;
      if (userCheck.userDoc == null || userCheck.userDoc.data()?.isAdmin !== true) {
        res.status(403).json({
          success: false,
          error: "You do not have permisson.",
        });
      }

      // 2. Get & parse data
      const assetId: number = parseInt(req.body.assetId);
      const amount: number = parseFloat(req.body.amount);
      const currency: string = req.body.currency;
      if (isNaN(assetId)) {return res.status(400).json({success: false, error: "Invalid assetId."});}
      if (isNaN(amount)) {return res.status(400).json({success: false, error: "Invalid amount."});}
      if (currency !== "GBP" && currency !== "USD" && currency !== "EUR") {return res.status(400).json({success: false, error: "Invalid currency."});}
      const assetCheck = await checkIfAssetExists(assetId);
      if (!assetCheck.returnedTrue) {return res.status(400).json({success: false, error: "Asset does not exist."});}
      const assetAddress = assetCheck.asset.docs[0].data().contractAddress;
      if (assetAddress == null) {return res.status(400).json({success: false, error: "Asset has no contract."});}

      // 3. Take snapshot of NFT owners.
      const isDevelopment = process.env.NODE_ENV == "development";
      const provider = new ethers.providers.JsonRpcProvider(
          `https://polygon-${isDevelopment ? "testnet" : "mainnet"}.blastapi.io/205572af-2fcb-4612-ba1a-f0645203690b`,
      isDevelopment ? "maticmum" : "matic"
      );
      const dealERC = new ethers.Contract(assetAddress, ISnapshotEnumerable.abi, provider);
      const ownerCount: number = (await dealERC.entriesInLastSnapshot()).toNumber();
      const snapshot: { 0: Array<string>, 1: Array<BigNumber> } =
      await dealERC.entriesFromLastSnapshot(0, ownerCount);
      const ownersArr: Array<string> = snapshot[0];
      const tokenAmountArr: Array<BigNumber> = snapshot[1];

      const totalTokens = tokenAmountArr.reduce((a, b) => a.add(b)).toNumber();

      // 4. Begin distribution log
      const db = admin.firestore();
      let distributionId = "";
      try {
        const newDistributionLog = await db.collection(DISTRIBUTION_HISTORY_COLLECTION).add({
          assetId,
          amount,
          currency,
          ownerCount: ownerCount,
          date: Date.now(),
          issuer: userCheck?.userId,
        });
        distributionId = newDistributionLog.id;
      }
      catch {
        return res.status(500).json({success: false, error: "Error with beginning log."});
      }

      // 5. Distribute cash to each NFT owner via batched write.
      const bal = db.collection(BALANCES_COLLECTION);
      let totalWritten = 0; const transactionHistory: Array<TransactionLog> = [];
      while (totalWritten < ownerCount) {
        await db.runTransaction(async (t) => {
          for (let w = 0; w < 500 && totalWritten < ownersArr.length; w++, totalWritten++) {
            const owner = ownersArr[totalWritten].toLowerCase();
            const ownerTokenCount = tokenAmountArr[totalWritten].toNumber();
            const portion = amount * (ownerTokenCount / totalTokens);
            const incr = admin.firestore.FieldValue.increment(portion);
            const docRef = bal.doc(owner);
            t.set(docRef, {[currency]: incr}, {merge: true});
            transactionHistory.push({
              distributionId,
              currency,
              walletAddress: owner,
              amount: portion,
              date: Date.now(),
              assetId: assetId,
              assetQuantity: ownerTokenCount,
            });
          }
        });
      }

      // 6. Transaction logging.
      for (let i = 0; i < transactionHistory.length; i++) {
        await db.collection(TRANSACTION_HISTORY_COLLECTION).add(transactionHistory[i]);
      }

      return res.status(200).json({success: true});
    });

// Asks for a withdraw nonce
Router.post("/withdrawNonce",
    async function(req: express.Request, res: express.Response) {
    // 1. Fetch data & authenticate that user is authenticated
      const userCheck = await checkIfKYCExistsFromAuthToken(req, res);
      if (!userCheck.returnedTrue) return;

      // 2. Get data from request.
      const address: string = req.body.address;
      const amount: number = parseFloat(req.body.amount);
      const currency: string = req.body.currency;
      const method: string = req.body.method;
      if (isNaN(amount)) return res.status(400).json({success: false, error: "Invalid amount."});
      if (currency !== "GBP" && currency !== "USD" && currency !== "EUR") {return res.status(400).json({success: false, error: "Invalid currency."});}
      if (method !== "USDC") return res.status(400).json({success: false, error: "Invalid withdraw method."});

      // 4. Generate nonce & add to collection.
      const nonce = Math.floor(Math.random() * 1000000000000);
      await admin.firestore().collection(WITHDRAW_REQUEST_COLLECTION)
          .doc(userCheck.userId)
          .set({
            address,
            amount,
            currency,
            method,
            nonce,
          });
      return res.status(200).json({success: true, nonce: nonce});
    }
);

Router.post("/finalizeWithdraw",
    async function(req: express.Request, res: express.Response) {
      console.log("ITS HAPPENING");

      // 1. Fetch data & authenticate that user
      const userCheck = await checkIfKYCExistsFromAuthToken(req, res);
      if (!userCheck.returnedTrue) return;

      // 2. Check data.
      const address: string = req.body.address?.toLowerCase();
      const signature: string = req.body.signature;
      const db = admin.firestore();
      const ref = db.collection(WITHDRAW_REQUEST_COLLECTION).doc(userCheck.userId);

      // 3. Check to ensure that wallet addresses are the same.
      const withdrawData: WithdrawRequest = (await ref.get()).data() as WithdrawRequest;
      if (address !== withdrawData.address.toLowerCase()) {
        return res.status(400).json({success: false, error: "Addresses are not the same."});
      }

      // 4. Check metamask for the nonce message.
      const toHex = (stringToConvert: string) =>
        stringToConvert
            .split("")
            .map((c: string) => c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join("");
      const recoveredAddress = recoverPersonalSignature({
        data: `0x${toHex(withdrawData.nonce.toString())}`,
        signature,
      });
      const allSameAddresses =
      withdrawData.address.toLowerCase() === recoveredAddress.toLowerCase() &&
      withdrawData.address.toLowerCase() === address.toLowerCase();
      if (!allSameAddresses) {return res.status(400).json({success: false, error: "Nonce was not signed correctly."});}

      // 5. Check for the exchange rate before changing anything, if necessary.
      const rates: ConversionRates = await axios
          .get("https://v6.exchangerate-api.com/v6/f9ff3bcf0d99af888b7cef73/latest/USD")
          .then((res) => res.data) as ConversionRates;
      if (rates == null) {
        return res.status(500)
            .json({success: false, error: "Error with fetching exchange rates."});
      }
      console.log("rates", rates);

      // 6. Use a transaction & make sure to log it.
      // TODO: check to make sure that the error throwing works
      try {
        await db.runTransaction(async (t) => {
          const balRef = db.collection(BALANCES_COLLECTION).doc(address);
          const userBalances = (await t.get(balRef)).data() as UserBalance;
          console.log("balances", userBalances);
          console.log("withdraw data", withdrawData);
          const balance = userBalances[withdrawData.currency] ?? 0;
          if (withdrawData.amount > balance) throw Error();

          console.log("Starting delete");
          t.delete(ref);
          console.log("Starting update");
          t.update(balRef, {
            [withdrawData.currency]: balance - withdrawData.amount,
          });

          // Logging
          const trans: TransactionLog = {
            method: withdrawData.method,
            walletAddress: address,
            amount: -withdrawData.amount,
            date: Date.now(),
            currency: withdrawData.currency,
          };
          console.log("Starting logging", trans);
          t.create(db.collection(TRANSACTION_HISTORY_COLLECTION).doc(), trans);
        });
      }
      catch {
        return res.status(400).json({success: false, error: "Requested too much."});
      }

      // 7. Send the money via the requested method.
      const rate = rates.conversion_rates[withdrawData.currency];
      const usdToSend = (withdrawData.amount / rate).toFixed(6);

      console.log("USD to send", usdToSend);
      const options = { // : Moralis.TransferOptions = {
        type: "erc20",
        amount: Moralis.Units.Token(usdToSend.toString(), 6),
        receiver: address,
        contractAddress: process.env.NODE_ENV == "development" ? keys.mumbaiUSDC : keys.polygonUSDC,
      };
      console.log("Moralis options", options);
      const result = await Moralis.transfer(options);

      return res.status(200).json(result);
    }
);

export default Router;
