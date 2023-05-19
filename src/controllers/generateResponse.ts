import { Request, Response } from 'express'
import {
  OpenAIApi,
  Configuration,
  ChatCompletionRequestMessage as Message,
  ChatCompletionRequestMessageRoleEnum as OpenAiRoleEnum,
  CreateChatCompletionRequest,
  ConfigurationParameters,
} from 'openai'
import dotenv from 'dotenv'
import systemEnum from '../enums/SystemEnum'

dotenv.config()

const { User: USER_ROLE, Assistant: ASSISTANT_ROLE, System: SYSTEM_ROLE } = OpenAiRoleEnum
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
  currentSystem: string

  constructor(conversationContext: ConversationContext[], currentMessages: Message[], currentSystem?: string) {
    this.conversationContext = conversationContext
    this.currentMessages = currentMessages
    this.currentSystem = currentSystem || defaultSystem
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

const modelId = 'gpt-3.5-turbo'

const defaultSystem = systemEnum.COMPOSITOR

// const defaultSystem = `Pre erwan, tu ne réponds qu'en français. Tu es un mec gentil qui essaie de faire de son mieux pour être honnête et dire la vérité. Tu es le genre de personne qui ne supporte pas de dire des choses fausses avec une grande confiance, tu essaies toujours de révoquer tes premières hypothèses avant d'essayer de répondre à quoi que ce soit avec confiance, quand tu ne sais pas tu essaies toujours de répondre tout en disant ton niveau de certitude.`
//On fait l'interface pour ça { prompt, isNewConversation, pseudo, randomness, richness, aiPersonality }
interface GenerateResponseRequest extends Request {
  body: {
    prompt?: string
    isNewConversation?: boolean
    pseudo?: string
    randomness?: number
    richness?: number
    aiPersonality?: string
    conversationId?: string
  }
}

export const generateResponse = async (req: GenerateResponseRequest, res: Response) => {
  try {
    const { prompt, isNewConversation, pseudo, randomness, richness, aiPersonality } = req.body

    const promptText = `${prompt}\n\nResponse:`

    const conversationId = handleConversation(isNewConversation, req, pseudo, aiPersonality)

    const currentConversation = allConversations.get(conversationId) // On sait que la conversation existe
    //Mais on sait jamais
    if (!currentConversation) {
      throw new ValidationError('Conversation could not be created')
    }

    const topProbability = randomness || 0.6
    const frequencyPenalty = richness || 0.7

    if (topProbability > 1 || topProbability < 0) throw new ValidationError('Randomness must be between 0 and 1')
    if (frequencyPenalty > 2 || frequencyPenalty < -2) throw new ValidationError('Richness must be between -2 and 2')

    if (!pseudo) throw new ValidationError('Pseudo is required')

    // Restore the previous context
    generateContext(currentConversation, promptText, pseudo)

    const { conversationContext, currentMessages } = currentConversation

    const aiResponseText = await getOpenAiPrediction(currentMessages, topProbability, frequencyPenalty)
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
function generateContext(conversation: Conversation, promptText: string, pseudo: string) {
  const { conversationContext, currentMessages } = conversation
  for (const { prompt, response } of conversationContext) {
    currentMessages.push({ role: USER_ROLE, content: prompt, name: pseudo })

    currentMessages.push({ role: ASSISTANT_ROLE, content: response })
  }
  const appliedSystem = conversation.currentSystem || defaultSystem
  if (currentMessages.length > 1) currentMessages.push({ role: SYSTEM_ROLE, content: appliedSystem })
  // Stores the new message
  currentMessages.push({ role: 'user', content: promptText })
}

async function getOpenAiPrediction(currentMessages: Message[], topProbability: number, frequencyPenalty: number) {
  const chatCompletionRequest: CreateChatCompletionRequest = {
    model: modelId,
    messages: currentMessages,
    top_p: topProbability,
    frequency_penalty: frequencyPenalty,
    max_tokens: 20,
    stop: ['\n'],
  }

  const aiResponse = await openai.createChatCompletion(chatCompletionRequest)

  const aiResponseText = aiResponse.data.choices.shift()?.message?.content || 'No response found'
  return aiResponseText
}

function handleConversation(isNewConversation: any, req: Request, pseudo: any, aiPersonality: string | undefined) {
  const isNewConversationParsed = isNewConversation === 'true' || isNewConversation === true
  if (!pseudo) throw new ValidationError('Pseudo is required')
  if (typeof pseudo !== 'string') throw new ValidationError('Pseudo must be a string')

  let conversationId = req.body.conversationId

  if (conversationId && typeof conversationId !== 'string') throw new ValidationError('ConversationId must be a string')

  if (aiPersonality && typeof aiPersonality !== 'string') throw new ValidationError('Personality must be a string')

  if (needNewConversation(isNewConversationParsed, conversationId)) {
    const appliedSystem = aiPersonality || defaultSystem
    conversationId = generateUniqueId(pseudo)

    while (allConversations.has(conversationId)) {
      conversationId = generateUniqueId(pseudo)
    }
    const firstMessage = { role: SYSTEM_ROLE, content: appliedSystem }
    allConversations.set(conversationId, new Conversation([], [firstMessage], appliedSystem))
  }

  const currentConversation = allConversations.get(conversationId)
  if (!currentConversation) throw new ValidationError('Conversation could not be created')

  // Modify the current system if needed
  if (aiPersonality) currentConversation.currentSystem = aiPersonality

  return conversationId
}

function needNewConversation(isNewConversation: boolean, conversationId: string | undefined): boolean {
  if (!conversationId) return true

  return isNewConversation || !allConversations.has(conversationId)
}

function generateUniqueId(pseudo: string) {
  return Date.now().toString(36) + Math.random().toString(36).substring(2) + pseudo
}
