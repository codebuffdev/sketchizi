package dev.sketchizi.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("dev")
public class DevDatabaseReset implements ApplicationRunner {

    private static final Logger log =
            LoggerFactory.getLogger(DevDatabaseReset.class);

    private final JdbcTemplate jdbcTemplate;

    public DevDatabaseReset(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        log.warn("DEV PROFILE: resetting authentication test data");

        jdbcTemplate.update("DELETE FROM spring_session_attributes");
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM sketchizi_users");

        log.warn("DEV PROFILE: authentication test data reset complete");
    }
}