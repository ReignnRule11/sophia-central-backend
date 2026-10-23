export type SeedInstitution = {
  name: string;
  country: string;
  city: string;
  faculties: Array<{
    name: string;
    departments: string[];
  }>;
};

export const defaultSeedInstitutions: SeedInstitution[] = [
  {
    name: 'University of Lagos',
    country: 'Nigeria',
    city: 'Lagos',
    faculties: [
      {
        name: 'Engineering',
        departments: ['Computer Engineering', 'Electrical Engineering', 'Civil Engineering'],
      },
      {
        name: 'Science',
        departments: ['Physics', 'Chemistry', 'Mathematics'],
      },
    ],
  },
  {
    name: 'University of Ibadan',
    country: 'Nigeria',
    city: 'Ibadan',
    faculties: [
      {
        name: 'Arts',
        departments: ['English', 'History', 'Economics'],
      },
      {
        name: 'Technology',
        departments: ['Software Engineering', 'Mechanical Engineering'],
      },
    ],
  },
];

export const defaultSeedCourses = [
  { title: 'Data Structures and Algorithms', code: 'CSC201', level: '200', institution: 'University of Lagos' },
  { title: 'Operating Systems', code: 'CSC301', level: '300', institution: 'University of Lagos' },
  { title: 'Software Engineering', code: 'CSC401', level: '400', institution: 'University of Ibadan' },
  { title: 'Machine Learning', code: 'CSC501', level: '500', institution: 'University of Ibadan' },
];

export const defaultSeedResources = [
  {
    title: 'Lecture notes: Data Structures',
    description: 'Core revision notes for arrays, stacks, trees, and graphs.',
    type: 'lecture_notes',
    course: 'Data Structures and Algorithms',
    topic: 'Data structures',
    institution: 'University of Lagos',
    level: '200',
  },
  {
    title: 'Past Questions: Operating Systems',
    description: 'Compilation of prior exam questions for revision.',
    type: 'past_question',
    course: 'Operating Systems',
    topic: 'Scheduling',
    institution: 'University of Lagos',
    level: '300',
  },
];
