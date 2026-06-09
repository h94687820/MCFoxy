import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import settingsRouter from "./settings";
import profilesRouter from "./profiles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(settingsRouter);
router.use(profilesRouter);

export default router;
