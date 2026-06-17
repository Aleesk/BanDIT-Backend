const express = require("express");
const cors = require("cors");

const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = require("./serviceAccount.json");

const { getFirestore } = require("firebase-admin/firestore");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("BanDIT Backend funcionando");
});

app.post("/sendNotification", async (req, res) => {

    try {

        const { token, title, body } = req.body;

        const response = await getMessaging().send({
            token,
            notification: {
                title,
                body
            }
        });

        console.log("Mensaje enviado:", response);

        res.json({
            success: true,
            messageId: response
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

app.post("/sendAlert", async (req, res) => {

    try {

        const { patientId } = req.body;

        const patientDoc =
            await db.collection("users")
                .doc(patientId)
                .get();

        if (!patientDoc.exists) {

            return res.status(404).json({
                success: false,
                error: "Paciente no encontrado"
            });

        }

        const patientData = patientDoc.data();

        const caregiverId = patientData.caregiverId;

        if (!caregiverId) {

            return res.status(400).json({
                success: false,
                error: "Paciente sin cuidador asociado"
            });

        }

        const caregiverDoc =
            await db.collection("users")
                .doc(caregiverId)
                .get();

        if (!caregiverDoc.exists) {

            return res.status(404).json({
                success: false,
                error: "Cuidador no encontrado"
            });

        }

        const caregiverData = caregiverDoc.data();

        const token = caregiverData.fcmToken;

        if (!token) {

            return res.status(400).json({
                success: false,
                error: "Cuidador sin token FCM"
            });

        }

        const response = await getMessaging().send({
            token,
            notification: {
                title: "🚨 Alerta BanDIT",
                body: `${patientData.name} necesita ayuda`
            }
        });

        await db.collection("alerts").add({
            patientId,
            caregiverId,
            createdAt: new Date(),
            status: "sent"
        });

        res.json({
            success: true,
            messageId: response
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

app.listen(3000, () => {
    console.log("Servidor iniciado en puerto 3000");
});