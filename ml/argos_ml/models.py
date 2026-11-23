"""TensorFlow é importado somente ao construir/carregar IA."""


def build_gru(steps, num_features, task='position'):
    import tensorflow as tf
    if task not in ('position', 'behavior'):
        raise ValueError('tarefa_invalida')
    classification = task == 'behavior'
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(steps, num_features)),
        tf.keras.layers.GRU(32),
        tf.keras.layers.Dense(16, activation='relu'),
        tf.keras.layers.Dense(4 if classification else 2, activation='softmax' if classification else None),
    ])
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy' if classification else 'mse',
                  metrics=['accuracy'] if classification else ['mae'])
    return model
