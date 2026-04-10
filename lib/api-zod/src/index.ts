export * from "./generated/api";
export * from "./generated/types";

// Explicitly resolve duplicate exports — prefer the Zod runtime schemas from api
export {
  CreateApiKeyBody,
  CreateCampaignBody,
  CreateEmailAccountBody,
  CreateKnowledgeBaseDocBody,
  CreateLeadBody,
  CreatePromptTemplateBody,
  ImportLeadsBody,
  UpdateCampaignBody,
  UpdateIntegrationBody,
  UpdateLeadBody,
  UpdatePromptTemplateBody,
} from "./generated/api";
