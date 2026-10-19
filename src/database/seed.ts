import { DataSource, Repository } from 'typeorm';
import { Institution, Faculty, Department } from '../institutions/entities/institution.entity';
import { Course } from '../courses/entities/course.entity';
import { defaultSeedInstitutions, defaultSeedCourses, defaultSeedResources } from './seed-data';
import { Resource, ResourceType } from '../resources/entities/resource.entity';

export async function seedDatabase(dataSource: DataSource) {
  const institutionRepo: Repository<Institution> = dataSource.getRepository(Institution);
  const facultyRepo: Repository<Faculty> = dataSource.getRepository(Faculty);
  const departmentRepo: Repository<Department> = dataSource.getRepository(Department);
  const courseRepo: Repository<Course> = dataSource.getRepository(Course);
  const resourceRepo: Repository<Resource> = dataSource.getRepository(Resource);

  for (const institutionSeed of defaultSeedInstitutions) {
    let institution = await institutionRepo.findOne({ where: { name: institutionSeed.name } });
    if (!institution) {
      institution = institutionRepo.create({
        name: institutionSeed.name,
        country: institutionSeed.country,
        city: institutionSeed.city,
      });
      institution = await institutionRepo.save(institution);
    }

    for (const facultySeed of institutionSeed.faculties) {
      let faculty = await facultyRepo.findOne({ where: { name: facultySeed.name, institutionId: institution.id } });
      if (!faculty) {
        faculty = facultyRepo.create({
          name: facultySeed.name,
          institutionId: institution.id,
          institution,
        });
        faculty = await facultyRepo.save(faculty);
      }

      for (const departmentName of facultySeed.departments) {
        const exists = await departmentRepo.findOne({
          where: { name: departmentName, facultyId: faculty.id },
        });

        if (!exists) {
          const department = departmentRepo.create({
            name: departmentName,
            facultyId: faculty.id,
            faculty,
          });
          await departmentRepo.save(department);
        }
      }
    }
  }

  for (const courseSeed of defaultSeedCourses) {
    const institution = await institutionRepo.findOne({ where: { name: courseSeed.institution } });
    const existing = await courseRepo.findOne({ where: { title: courseSeed.title } });

    if (!existing) {
      const course = courseRepo.create({
        title: courseSeed.title,
        code: courseSeed.code,
        level: courseSeed.level,
        institutionId: institution?.id,
        institution,
      });
      await courseRepo.save(course);
    }
  }

  for (const resourceSeed of defaultSeedResources) {
    const exists = await resourceRepo.findOne({ where: { title: resourceSeed.title } });
    if (!exists) {
      const resource = resourceRepo.create({
        title: resourceSeed.title,
        description: resourceSeed.description,
        type: resourceSeed.type as ResourceType,
        course: resourceSeed.course,
        topic: resourceSeed.topic,
        institution: resourceSeed.institution,
        level: resourceSeed.level,
        moderationStatus: 'approved' as any,
        isVerified: true,
      });
      await resourceRepo.save(resource);
    }
  }
}
