import { Request, Response } from 'express'
import {
  OpenAIApi,
  Configuration,
  ChatCompletionRequestMessage as OpenAiRequestMessage,
  ChatCompletionRequestMessageRoleEnum as OpenAiRoleEnum,
  CreateChatCompletionRequest,
  ConfigurationParameters,
} from 'openai'
import dotenv from 'dotenv'

dotenv.config()

/*Nevermind, I want it in Interface */
interface Message extends OpenAiRequestMessage {
  role: OpenAiRoleEnum
  content: string
}
class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

interface ConversationContext {
  prompt: string
  response: string
}

class Conversation {
  conversationContext: ConversationContext[]
  currentMessages: Message[]

  constructor(conversationContext: ConversationContext[], currentMessages: Message[]) {
    this.conversationContext = conversationContext
    this.currentMessages = currentMessages
  }
}

const allConversations = new Map<string, Conversation>()

const configurationParams: ConfigurationParameters = {
  apiKey: process.env.OPENAI_API_KEY,
}

// OpenAIApi required config
const configuration = new Configuration(configurationParams)

// OpenAIApi initialization
const openai = new OpenAIApi(configuration)

// Controller function to handle chat conversation
export const generateResponse = async (req: Request, res: Response) => {
  try {
    const { prompt, isNewConversation, pseudo } = req.body
    const modelId = 'gpt-3.5-turbo'
    const promptText = `${prompt}\n\nResponse:`

    const conversationId = handleConversationCreation(isNewConversation, req, pseudo)

    const currentConversation = allConversations.get(conversationId) // On sait que la conversation existe
    //Mais on sait jamais
    if (!currentConversation) {
      throw new ValidationError('Conversation could not be created')
    }
    const { conversationContext, currentMessages } = currentConversation

    // Restore the previous context
    for (const { prompt, response } of conversationContext) {
      currentMessages.push({ role: 'user', content: prompt })
      currentMessages.push({ role: 'assistant', content: response })
    }

    // Stores the new message
    currentMessages.push({ role: 'user', content: promptText })

    const chatCompletionRequest: CreateChatCompletionRequest = {
      model: modelId,
      messages: currentMessages,
    }

    const aiResponse = await openai.createChatCompletion(chatCompletionRequest)

    const aiResponseText = aiResponse.data.choices.shift()?.message?.content || 'No response found'
    conversationContext.push({ prompt: promptText, response: aiResponseText })
    res.send({ response: aiResponseText, conversationId })
  } catch (err) {
    console.error(err)

    if (err instanceof ValidationError) {
      return res.status(400).json({ message: err.message })
    }

    res.status(500).json({ message: 'Internal server error' })
  }
}
function handleConversationCreation(isNewConversation: any, req: Request, pseudo: any) {
  const isNewConversationParsed = isNewConversation === 'true' || isNewConversation === true

  let conversationId = req.body.conversationId

  if (needNewConversation(isNewConversationParsed, conversationId)) {
    if (!pseudo) throw new ValidationError('Pseudo is required for new conversations')

    conversationId = generateUniqueId(pseudo)

    while (allConversations.has(conversationId)) {
      conversationId = generateUniqueId(pseudo)
    }

    allConversations.set(conversationId, new Conversation([], []))
  }
  return conversationId
}

function needNewConversation(isNewConversation: boolean, conversationId: string | undefined): boolean {
  if (!conversationId) return true

  return isNewConversation || !allConversations.has(conversationId)
}

function generateUniqueId(pseudo: string) {
  return Date.now().toString(36) + Math.random().toString(36).substring(2) + pseudo
}
