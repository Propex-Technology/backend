import * as express from "express";
import * as admin from "firebase-admin";
import * as cors from "cors";
import * as functions from "firebase-functions";
import helmet from "helmet";
import keys from "./devKeys";
// import Moralis from "moralis/node";
const Moralis = require("moralis/node");
// Routers
import assets from "./v1/assets";
import users from "./v1/users";
import payments from "./v1/payments";

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

// CORS options
/*
const corsOptions = {
  // origin: true, // "*", // @TODO: add correct CORS options, switch based on environment
  // optionsSuccessStatus: 200,
  origin: "*",
};
*/

// Express Setup
const app = express();
// https://expressjs.com/en/advanced/best-practice-security.html#use-helmet
app.use(helmet());
app.use(cors());
app.use(express.json());
// app.use(validationErrorMiddleware);

const asyncSetup = async () => {
  // Moralis setup
  await Moralis.start({
    // serverUrl: keys.moralisServerUrl,
    // appId: keys.moralisAppId,
    // masterKey: keys.moralisServerMasterKey,
    moralisSecret: keys.moralisSecret,
  });
  await Moralis.enableWeb3({
    privateKey: keys.accountKey,
    chainId: 80001,
  });

  // Express Routers
  app.use("/assets", assets);
  app.use("/users", users);
  app.use("/payments", payments);
};
asyncSetup();

export const v1: functions.HttpsFunction = functions
    .runWith({timeoutSeconds: 180})
    .https.onRequest(app);
