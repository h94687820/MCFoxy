import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(settingsRouter);

export default router;
