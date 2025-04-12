import { Checkbox, TextInput, Group, Button, Select } from '@mantine/core';
import { useForm } from '@mantine/form';

export function BaseForm({
  fields,
  validation,
  onSubmit,
  submitLabel = 'Submit',
}: Props) {
  const initialValues = fields.reduce((acc, field) => {
    acc[field.name] = '';
    return acc;
  }, {} as Record<string, string>);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues,
    validate: validation,
  });

  return (
    <form onSubmit={form.onSubmit(values => console.log(values))}>
      {fields.map(field => {
        if (field.type === 'select') {
          return (
            <Select
              key={field.name}
              label={field.label}
              allowDeselect={false}
              required={field.required}
              data={field.data}
              {...form.getInputProps(field.name)}
              mb='sm'
            />
          );
        }
        return (
          <TextInput
            key={field.name}
            label={field.label}
            placeholder={field.placeholder}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb='sm'
          />
        );
      })}

      <Group justify='flex-end' mt='md'>
        <Button type='submit'>{submitLabel}</Button>
      </Group>
    </form>
  );
}

interface Props {
  fields: FieldsConfig[];
  validation?: object;
  onSubmit?: (values: Record<string, string>) => void; // TODO: Remove the optional after testing
  submitLabel?: string;
}

interface FieldsConfig {
  name: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'select';
  required?: boolean;
  data?: string[];
}
