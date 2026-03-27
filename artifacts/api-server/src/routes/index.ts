import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import healthRouter from "./health";
import authRouter from "./auth";
import docsRouter from "./docs";
import dashboardRouter from "./dashboard";
import leadsRouter from "./leads";
import campaignsRouter from "./campaigns";
import emailAccountsRouter from "./emailAccounts";
import integrationsRouter from "./integrations";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";
import knowledgeBaseRouter from "./knowledgeBase";
import agentLogsRouter from "./agentLogs";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(docsRouter);

router.use(requireAuth);
router.use(dashboardRouter);
router.use(leadsRouter);
router.use(campaignsRouter);
router.use(emailAccountsRouter);
router.use(integrationsRouter);
router.use(analyticsRouter);
router.use(aiRouter);
router.use(knowledgeBaseRouter);
router.use(agentLogsRouter);
router.use(settingsRouter);

export default router;
