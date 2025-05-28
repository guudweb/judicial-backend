import passport from "../config/passport.js";
import { AppError } from "./errorHandler.js";

export const authenticate = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return next(new AppError("No autorizado", 401));
    }

    req.user = user;
    next();
  })(req, res, next);
};

export const optionalAuth = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};
