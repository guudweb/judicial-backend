const logger = {
  info: (message, meta = {}) => {
    console.log(
      JSON.stringify({
        level: "info",
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  },

  error: (message, error = null, meta = {}) => {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        error: error?.stack || error?.message || error,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  },

  warn: (message, meta = {}) => {
    console.warn(
      JSON.stringify({
        level: "warn",
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  },

  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(
        JSON.stringify({
          level: "debug",
          message,
          timestamp: new Date().toISOString(),
          ...meta,
        })
      );
    }
  },
};

export default logger;
