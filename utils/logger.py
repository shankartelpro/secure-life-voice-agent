# insurance_voice_agent/utils/logger.py
import logging
import sys

# Configure Logging
def setup_logger():
    logger = logging.getLogger("SecureLife")
    logger.setLevel(logging.DEBUG)  # Capture ALL details
    
    # Console Handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG)
    
    # Format: Time - Level - Message
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%H:%M:%S')
    ch.setFormatter(formatter)
    
    logger.addHandler(ch)
    return logger

# Global logger instance
log = setup_logger()