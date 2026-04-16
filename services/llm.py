# insurance_voice_agent/services/llm.py
from openai import AsyncOpenAI
from config import settings
from agent.prompts import SYSTEM_INSTRUCTIONS
from utils.logger import log

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

async def get_response_from_llm(conversation_history: list) -> str:
    """
    Send conversation history to OpenAI and get the next response.
    """
    log.info(f"LLM: Generating response. History length: {len(conversation_history)}")
    
    # Insert system instruction at the start if not present
    if not any(msg.get("role") == "system" for msg in conversation_history):
        conversation_history.insert(0, {"role": "system", "content": SYSTEM_INSTRUCTIONS})

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=conversation_history,
            temperature=0.7,
            max_tokens=150
        )
        
        content = response.choices[0].message.content
        log.info(f"LLM: Generated: '{content}'")
        return content
        
    except Exception as e:
        log.error(f"LLM Error: {e}")
        return "I'm having a little trouble connecting. Could you say that again?"