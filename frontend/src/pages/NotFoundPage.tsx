import { useNavigate } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.text}>The page you are looking for does not exist.</p>
      <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
        Go back
      </button>
    </div>
  );
}
