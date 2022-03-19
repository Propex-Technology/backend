import * as express from "express";
import * as admin from "firebase-admin";
import * as cors from "cors";
import * as functions from "firebase-functions";
import helmet from "helmet";
// import { validationErrorMiddleware } from "./middleware/schemaValidation";

// Routers
import assets from "./v1/assets";

// Firebase
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

// CORS options
const corsOptions = {
  origin: "*", // @TODO: add correct CORS options, switch based on environment
  optionsSuccessStatus: 200,
};

// Express Setup
const app = express();
// https://expressjs.com/en/advanced/best-practice-security.html#use-helmet
app.use(helmet());
app.use(cors(corsOptions));
// app.use(validationErrorMiddleware);

// Express Routers
app.use("/assets", assets);


export const v1: functions.HttpsFunction = functions.https.onRequest(app);
