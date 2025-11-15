import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { db, users } from "../db/index.js";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  new JwtStrategy(opts, async (payload, done) => {
    try {
      const user = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          departmentId: users.departmentId,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (user.length === 0) {
        return done(null, false);
      }

      if (!user[0].isActive) {
        return done(null, false);
      }

      return done(null, user[0]);
    } catch (error) {
      return done(error, false);
    }
  })
);

export default passport;
