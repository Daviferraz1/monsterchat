type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  channel?: string;
  contactId?: string;
  messageId?: string;
  action?: string;
  [key: string]: any;
}

export const logger = {
  info: (message: string, context?: LogContext) => {
    console.log(JSON.stringify({ level: 'info', message, ...context, timestamp: new Date().toISOString() }));
  },
  
  warn: (message: string, context?: LogContext) => {
    console.warn(JSON.stringify({ level: 'warn', message, ...context, timestamp: new Date().toISOString() }));
  },
  
  error: (message: string, error?: Error | unknown, context?: LogContext) => {
    const errorDetails = error instanceof Error 
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
    console.error(JSON.stringify({ level: 'error', message, ...errorDetails, ...context, timestamp: new Date().toISOString() }));
  },
  
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify({ level: 'debug', message, ...context, timestamp: new Date().toISOString() }));
    }
  },
};
