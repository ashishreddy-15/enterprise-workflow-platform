package com.ashish.workflow.security;

public final class UserContextHolder {

    private static final ThreadLocal<UserContext> CONTEXT = new ThreadLocal<>();

    private UserContextHolder() {}

    public static void set(UserContext userContext) {
        CONTEXT.set(userContext);
    }

    public static UserContext getRequiredContext() {
        UserContext ctx = CONTEXT.get();
        if (ctx == null || ctx.userId() == null || ctx.userId().isBlank()) {
            throw new SecurityException("Missing required authentication header: X-User-Id");
        }
        return ctx;
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
