import * as express from "express";
import * as admin from "firebase-admin";
import * as cors from "cors";
import * as functions from "firebase-functions";
// import { validationErrorMiddleware } from "./middleware/schemaValidation";

// Routers
import property from "./v1/property";

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
// https://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");
app.use(cors(corsOptions));
// app.use(validationErrorMiddleware);

// Express Routers
app.use("/property", property);


export const v1: functions.HttpsFunction = functions.https.onRequest(app);
