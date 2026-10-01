import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, ProtectedRoute } from "@/context/AuthContext";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ExamBuilder from "@/pages/ExamBuilder";
import Results from "@/pages/Results";
import StudentExam from "@/pages/StudentExam";
import Classes from "@/pages/Classes";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/connexion" element={<Login />} />
            <Route path="/examen" element={<StudentExam />} />
            <Route path="/enseignant" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/enseignant/examens/nouveau" element={<ProtectedRoute><ExamBuilder /></ProtectedRoute>} />
            <Route path="/enseignant/examens/:id" element={<ProtectedRoute><ExamBuilder /></ProtectedRoute>} />
            <Route path="/enseignant/examens/:id/resultats" element={<ProtectedRoute><Results /></ProtectedRoute>} />
            <Route path="/enseignant/classes" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
