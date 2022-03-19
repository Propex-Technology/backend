import * as express from "express";
// import * as functions from "firebase-functions";

const Router: express.Router = express.Router();

// Router.use("/data", validateSchema);
Router.get("/", function(req: express.Request, res: express.Response) {
  res.status(200).json({
    "data": "this is the data",
  });
  return;
});

export default Router;
