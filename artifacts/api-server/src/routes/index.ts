import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import filesRouter from "./files";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(filesRouter);
router.use(settingsRouter);

export default router;
