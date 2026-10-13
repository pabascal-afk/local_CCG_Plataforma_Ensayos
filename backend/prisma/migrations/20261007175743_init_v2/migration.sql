-- CreateTable
CREATE TABLE "User" (
    "rut" TEXT NOT NULL PRIMARY KEY,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "name" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "courseId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Course" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "level" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "year" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "TeacherCourse" (
    "teacherRut" TEXT NOT NULL,
    "courseId" INTEGER NOT NULL,

    PRIMARY KEY ("teacherRut", "courseId"),
    CONSTRAINT "TeacherCourse_teacherRut_fkey" FOREIGN KEY ("teacherRut") REFERENCES "User" ("rut") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "optionsCount" INTEGER NOT NULL DEFAULT 4,
    "durationMinutes" INTEGER,
    "passThreshold" REAL NOT NULL DEFAULT 0.6,
    "minGrade" REAL NOT NULL DEFAULT 1.0,
    "cutElemental" REAL NOT NULL DEFAULT 0.50,
    "cutAdecuado" REAL NOT NULL DEFAULT 0.75,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Question" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examId" INTEGER NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "skill" TEXT,
    "axis" TEXT,
    CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "opensAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" DATETIME,
    "releasedBy" TEXT,
    CONSTRAINT "ExamAssignment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentRut" TEXT NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "correctCount" INTEGER,
    "percent" REAL,
    "grade" REAL,
    "achievementLevel" TEXT,
    CONSTRAINT "Submission_studentRut_fkey" FOREIGN KEY ("studentRut") REFERENCES "User" ("rut") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ExamAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubmissionAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "submissionId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubmissionAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubmissionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_level_letter_year_key" ON "Course"("level", "letter", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Question_examId_questionNumber_key" ON "Question"("examId", "questionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAssignment_examId_courseId_key" ON "ExamAssignment"("examId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_studentRut_assignmentId_key" ON "Submission"("studentRut", "assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAnswer_submissionId_questionId_key" ON "SubmissionAnswer"("submissionId", "questionId");
