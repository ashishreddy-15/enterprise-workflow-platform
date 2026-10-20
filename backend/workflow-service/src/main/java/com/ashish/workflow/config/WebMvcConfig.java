package com.ashish.workflow.config;

import com.ashish.workflow.security.UserHeaderInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final UserHeaderInterceptor userHeaderInterceptor;

    public WebMvcConfig(UserHeaderInterceptor userHeaderInterceptor) {
        this.userHeaderInterceptor = userHeaderInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(userHeaderInterceptor)
                .addPathPatterns("/api/v1/**");
    }
}