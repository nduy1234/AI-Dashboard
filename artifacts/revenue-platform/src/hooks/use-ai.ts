import { useMutation } from "@tanstack/react-query";
import { 
  aiPersonalizeEmail,
  aiGenerateSequence,
  aiQualifyLead,
  aiChat,
  aiGenerateReactivation,
  type AIPersonalizeBody,
  type AIGenerateSequenceBody,
  type AIQualifyLeadBody,
  type AIChatBody,
  type AIReactivationBody
} from "@workspace/api-client-react";

export function useAIPersonalize() {
  return useMutation({
    mutationFn: (data: AIPersonalizeBody) => aiPersonalizeEmail(data, { credentials: "include" }),
  });
}

export function useAIGenerateSequence() {
  return useMutation({
    mutationFn: (data: AIGenerateSequenceBody) => aiGenerateSequence(data, { credentials: "include" }),
  });
}

export function useAIQualifyLead() {
  return useMutation({
    mutationFn: (data: AIQualifyLeadBody) => aiQualifyLead(data, { credentials: "include" }),
  });
}

export function useAIChat() {
  return useMutation({
    mutationFn: (data: AIChatBody) => aiChat(data, { credentials: "include" }),
  });
}

export function useAIReactivation() {
  return useMutation({
    mutationFn: (data: AIReactivationBody) => aiGenerateReactivation(data, { credentials: "include" }),
  });
}
