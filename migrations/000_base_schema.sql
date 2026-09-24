CREATE TABLE IF NOT EXISTS users (
    id          SERIAL        PRIMARY KEY,
    email       VARCHAR(255)  NOT NULL UNIQUE,
    password    VARCHAR(255)  NOT NULL,
    name        VARCHAR(255)  NOT NULL
);

CREATE TABLE IF NOT EXISTS type (
    type_id     SERIAL        PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS activity (
    act_id      SERIAL        PRIMARY KEY,
    staff_id    INT           NOT NULL REFERENCES users(id),
    type_id     INT           NOT NULL REFERENCES type(type_id),
    mode        VARCHAR(7),
    acad_year   VARCHAR(9),
    start_date  DATE,
    end_date    DATE,
    role        VARCHAR(255),
    event_time  VARCHAR(50),
    start_time  TIME,
    end_time    TIME,
    img         BYTEA,
    cert        BYTEA,
    report      BYTEA,
    approved    BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS value_added_course (
    act_id      INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    course_name VARCHAR(255)  NOT NULL,
    course_code VARCHAR(100),
    headcount   INT
);

CREATE TABLE IF NOT EXISTS fdp_workshop (
    act_id        INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    event_name    VARCHAR(255)  NOT NULL,
    type          VARCHAR(100),
    collab_entity VARCHAR(255),
    duration      INT,          
    fees          INT,
    fees_funded   BOOLEAN,
    fund_agency   VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS guest_session (
    act_id      INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    event_name  VARCHAR(255)  NOT NULL,
    role        VARCHAR(255),
    duration    INT           
);

CREATE TABLE IF NOT EXISTS grant_received (
    act_id       INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    name         VARCHAR(255)  NOT NULL,
    prim_invest  VARCHAR(255),
    fund_agency  VARCHAR(255),
    org_nature   VARCHAR(100),
    fund_amt     INT,
    duration     INT           
);

CREATE TABLE IF NOT EXISTS research_published (
    act_id       INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    name_auths   VARCHAR(500)  NOT NULL,
    paper_title  VARCHAR(500)  NOT NULL,
    venue        VARCHAR(255),
    journal      VARCHAR(255),
    ugc_link     VARCHAR(500),
    issn         VARCHAR(20),
    funds        INT,
    fund_agency  VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS book_chapter (
    act_id           INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    name_auths       VARCHAR(500)  NOT NULL,
    book_chap_title  VARCHAR(500)  NOT NULL,
    paper_title      VARCHAR(500),
    proc             VARCHAR(500),
    book_year        VARCHAR(4),
    isbn             VARCHAR(20),
    aff_insts        VARCHAR(500),
    publisher        VARCHAR(255),
    book_date        DATE
);

CREATE TABLE IF NOT EXISTS elearning (
    act_id    INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    name      VARCHAR(255)  NOT NULL,
    platform  VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS consultancy (
    act_id      INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    act_name    VARCHAR(255)  NOT NULL,
    client_org  VARCHAR(255),
    headcount   INT,
    revenue     INT
);

CREATE TABLE IF NOT EXISTS recognition (
    act_id    INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    act_name  VARCHAR(255)  NOT NULL,
    award     VARCHAR(255),
    awarding  VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS cep_program (
    act_id        INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    act_name      VARCHAR(255)  NOT NULL,
    num_students  INT,
    agencies      VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS misc (
    act_id      INT           PRIMARY KEY REFERENCES activity(act_id) ON DELETE CASCADE,
    description TEXT          NOT NULL
);

INSERT INTO type (name) VALUES
    ('Value Added Course'),
    ('FDP/Workshop/Seminar/Webinar'),
    ('Guest Invitation/Expert Session'),
    ('Grant Received'),
    ('Research Published'),
    ('Book Chapter Published'),
    ('E-Learning Material'),
    ('Consultancy Corporate Activity'),
    ('Recognition'),
    ('CEP Program'),
    ('Misc/Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (email, password, name)
VALUES ('admin@college.com', '$2b$10$dpE9j9J4eJpzlfss8kEaWu00fAHi1et.Z47UKd7ZjZgrnX0sdKUwu', 'System Administrator')
ON CONFLICT (email) DO NOTHING;
