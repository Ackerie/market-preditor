import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coinsRouter from "./coins";
import portfolioRouter from "./portfolio";
import tradesRouter from "./trades";
import predictionsRouter from "./predictions";
import marketRouter from "./market";
import watchlistRouter from "./watchlist";
import autoTradeRouter, { startAutoTradeScheduler } from "./autoTrade";
import accountRouter from "./account";
import brokerRouter from "./broker";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(coinsRouter);
router.use(portfolioRouter);
router.use(tradesRouter);
router.use(predictionsRouter);
router.use(marketRouter);
router.use(watchlistRouter);
router.use(autoTradeRouter);
router.use(accountRouter);
router.use(brokerRouter);

startAutoTradeScheduler();

export default router;
